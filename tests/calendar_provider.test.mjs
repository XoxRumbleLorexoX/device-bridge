import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { CalendarMetadataProvider } from '../src/leverage/calendar_provider.mjs';
import { collectProvider } from '../src/leverage/providers.mjs';
import { LeverageService } from '../src/leverage/service.mjs';
import { LeverageStore } from '../src/leverage/storage.mjs';

const execFile = promisify(execFileCallback);
const now = Date.parse('2026-09-28T00:00:00Z');

const sensitiveValues = [
  'SECRET Board Acquisition',
  'SECRET launch plan and customer names',
  'Private HQ Room 42',
  'Secret Person',
  'secret-person@example.invalid',
  'ceo@example.invalid',
  'https://meet.example.invalid/SECRET-room',
  'SECRET alarm text',
  'private-uid-123@example.invalid',
  'all-day-private-uid@example.invalid',
];

function assertNoSensitiveCalendarText(serialized) {
  for (const value of sensitiveValues) assert.equal(serialized.includes(value), false, `calendar provider leaked ${value}`);
}

async function calendarFixture() {
  const root = await mkdtemp(join(tmpdir(), 'device-bridge-calendar-provider-'));
  const path = join(root, 'private-calendar.ics');
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Private Fixture//EN',
    'BEGIN:VEVENT',
    'UID:private-uid-123@example.invalid',
    'DTSTART:20260920T100000Z',
    'DTEND:20260920T113000Z',
    'SUMMARY:SECRET Board Acquisition',
    'DESCRIPTION:SECRET launch plan and customer names',
    'LOCATION:Private HQ Room 42',
    'ATTENDEE;CN=Secret Person:mailto:secret-person@example.invalid',
    'ORGANIZER:mailto:ceo@example.invalid',
    'URL:https://meet.example.invalid/SECRET-room',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:SECRET alarm text',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:all-day-private-uid@example.invalid',
    'DTSTART;VALUE=DATE:20260922',
    'DTEND;VALUE=DATE:20260923',
    'SUMMARY:SECRET all day private event',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:cancelled-secret@example.invalid',
    'DTSTART:20260924T090000Z',
    'DTEND:20260924T100000Z',
    'SUMMARY:SECRET cancelled event',
    'STATUS:CANCELLED',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  await writeFile(path, content, { encoding: 'utf8', mode: 0o600 });
  return { root, path, content };
}

async function writeIcs(root, name, lines) {
  const path = join(root, name);
  await writeFile(path, ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR', ''].join('\r\n'), 'utf8');
  return path;
}

test('calendar provider emits timing metadata while excluding calendar content', async () => {
  const { path } = await calendarFixture();
  const provider = new CalendarMetadataProvider({ calendars: [{ label: 'work-calendar', path }] });
  const events = await collectProvider(provider, { since: '30d', now });

  assert.equal(events.length, 2);
  assert.ok(events.every(event => event.source === 'calendar-metadata'));
  assert.ok(events.every(event => event.application === 'calendar'));
  assert.ok(events.every(event => event.action_type === 'calendar_block'));
  assert.ok(events.every(event => event.object === 'work-calendar'));
  assert.ok(events.every(event => event.privacy_class === 'PRIVATE'));
  assert.ok(events.every(event => event.context.metric_semantics === 'calendar_timing_metadata_not_importance_or_productivity'));
  assert.ok(events.every(event => /^calendar-event:[0-9a-f]{32}$/u.test(event.raw_event_ref)));

  const timed = events.find(event => event.timestamp === '2026-09-20T10:00:00.000Z');
  assert.ok(timed);
  assert.equal(timed.duration_ms, 90 * 60 * 1000);
  assert.equal(timed.context.all_day, false);
  assert.equal(timed.context.busy, true);
  assert.equal(timed.context.time_basis, 'exact_utc');
  assert.equal(timed.confidence, 1);

  const allDay = events.find(event => event.context.all_day === true);
  assert.ok(allDay);
  assert.equal(allDay.timestamp, '2026-09-22T00:00:00.000Z');
  assert.equal(allDay.duration_ms, 24 * 60 * 60 * 1000);
  assert.equal(allDay.context.busy, false);
  assert.equal(allDay.context.time_basis, 'date_only_placeholder_utc_midnight');
  assert.equal(allDay.confidence, 0.8);

  assertNoSensitiveCalendarText(JSON.stringify(events));
  assert.equal(JSON.stringify(events).includes('cancelled-secret'), false);
});

test('calendar provider manifest declares minimization and timing limitations', async () => {
  const { path } = await calendarFixture();
  const provider = new CalendarMetadataProvider({ calendars: [{ label: 'calendar-a', path }] });
  const manifest = provider.describe();
  assert.equal(manifest.collection_mode, 'explicit_local_invocation');
  assert.equal(manifest.local_only, true);
  assert.deepEqual(manifest.declared_privacy_classes, ['PRIVATE']);
  assert.deepEqual(manifest.declared_applications, ['calendar']);
  assert.ok(manifest.data_exposed.includes('event duration'));
  assert.ok(manifest.data_not_collected.includes('event title/summary'));
  assert.ok(manifest.data_not_collected.includes('attendees'));
  assert.ok(manifest.limitations.some(value => /UTC/u.test(value)));
  assert.ok(manifest.limitations.some(value => /RRULE/u.test(value)));
  assert.match(manifest.interpretation, /does not establish importance|not.*importance/iu);
});

test('unsupported ambiguous or recurring calendar time semantics fail closed without content disclosure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'device-bridge-calendar-invalid-'));
  const tzid = await writeIcs(root, 'tzid.ics', [
    'BEGIN:VEVENT',
    'UID:private-uid-123@example.invalid',
    'DTSTART;TZID=Europe/Berlin:20260920T100000',
    'DTEND;TZID=Europe/Berlin:20260920T110000',
    'SUMMARY:SECRET Board Acquisition',
    'END:VEVENT',
  ]);
  const floating = await writeIcs(root, 'floating.ics', [
    'BEGIN:VEVENT',
    'UID:private-uid-123@example.invalid',
    'DTSTART:20260920T100000',
    'DTEND:20260920T110000',
    'SUMMARY:SECRET Board Acquisition',
    'END:VEVENT',
  ]);
  const recurring = await writeIcs(root, 'recurring.ics', [
    'BEGIN:VEVENT',
    'UID:private-uid-123@example.invalid',
    'DTSTART:20260920T100000Z',
    'DTEND:20260920T110000Z',
    'RRULE:FREQ=DAILY;COUNT=3',
    'SUMMARY:SECRET Board Acquisition',
    'END:VEVENT',
  ]);

  for (const [label, path] of [['tzid', tzid], ['floating', floating], ['recurring', recurring]]) {
    const provider = new CalendarMetadataProvider({ calendars: [{ label, path }] });
    let error;
    try { await provider.collect({ since: '30d', now }); } catch (caught) { error = caught; }
    assert.ok(error, `${label} should fail closed`);
    assert.match(error.message, /parsing failed/u);
    assertNoSensitiveCalendarText(error.message);
  }
});

test('calendar provider refuses symlink sources instead of following them', async t => {
  if (process.platform === 'win32') return t.skip('O_NOFOLLOW semantics are platform-specific.');
  const { root, path } = await calendarFixture();
  const link = join(root, 'calendar-link.ics');
  await symlink(path, link);
  const provider = new CalendarMetadataProvider({ calendars: [{ label: 'linked', path: link }] });
  await assert.rejects(() => provider.collect({ since: '30d', now }), /collection failed/u);
});

test('calendar collection flows through the service privacy and storage pipeline', async () => {
  const { root, path } = await calendarFixture();
  const store = new LeverageStore(join(root, 'store.json'));
  const service = new LeverageService(store, { clock: () => now });
  const provider = new CalendarMetadataProvider({ calendars: [{ label: 'calendar-a', path }] });
  const result = await service.collectProvider(provider, { since: '30d', now });
  assert.equal(result.collected_count, 2);
  assert.equal(result.ingestion.accepted_count, 2);
  const state = await store.read();
  assert.equal(state.events.length, 2);
  assertNoSensitiveCalendarText(JSON.stringify(state.events));

  const analysis = await service.analyse({ time_horizon: '30d', as_of: '2026-09-28T00:00:00.000Z' });
  assert.ok(analysis.activities.some(activity => activity.category === 'Schedule' && activity.subcategory === 'Calendar Block'));
  assert.ok(analysis.observations.some(item => item.variable_id === 'time.schedule.calendar_block_hours'));
});

test('provider preflight prevents calendar file access for pause/source/privacy/application exclusions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'device-bridge-calendar-policy-'));
  const missing = join(root, 'does-not-exist.ics');

  const cases = [
    { name: 'paused', patch: { observation_enabled: false }, reason: 'observation_paused' },
    { name: 'source', patch: { excluded_sources: ['CALENDAR-METADATA'] }, reason: 'source_excluded' },
    { name: 'privacy', patch: { allowed_privacy_classes: ['PUBLIC', 'PERSONAL'] }, reason: 'privacy_class_not_allowed' },
    { name: 'application', patch: { excluded_applications: ['Calendar'] }, reason: 'application_excluded' },
  ];

  for (const entry of cases) {
    const store = new LeverageStore(join(root, `${entry.name}.json`));
    const service = new LeverageService(store, { clock: () => now });
    await service.updatePrivacy(entry.patch);
    const provider = new CalendarMetadataProvider({ calendars: [{ label: entry.name, path: missing }] });
    const result = await service.collectProvider(provider, { since: '30d', now });
    assert.equal(result.collected_count, 0);
    assert.equal(result.ingestion.collection_skipped, true);
    assert.equal(result.ingestion.skip_reason, entry.reason);
    assert.equal((await store.read()).events.length, 0);
  }
});

test('collect-calendar CLI persists minimized events without printing calendar content', async () => {
  const { root, path } = await calendarFixture();
  const storePath = join(root, 'cli-store.json');
  const { stdout, stderr } = await execFile(process.execPath, [
    join(process.cwd(), 'src', 'cli.mjs'), 'leverage', 'collect-calendar',
    '--file', path, '--label', 'cli-calendar', '--since', '30d', '--store', storePath,
  ], { encoding: 'utf8', timeout: 15000 });
  assert.equal(stderr, '');
  const result = JSON.parse(stdout);
  assert.equal(result.provider.collection_mode, 'explicit_local_invocation');
  assert.equal(result.collected_count, 2);
  assert.equal(result.ingestion.accepted_count, 2);
  assertNoSensitiveCalendarText(stdout);

  const state = await new LeverageStore(storePath).read();
  assert.equal(state.events.length, 2);
  assertNoSensitiveCalendarText(JSON.stringify(state.events));
});

test('collect-calendar CLI honors application exclusion before touching the calendar file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'device-bridge-calendar-cli-policy-'));
  const storePath = join(root, 'store.json');
  const service = new LeverageService(new LeverageStore(storePath));
  await service.updatePrivacy({ excluded_applications: ['calendar'] });
  const missing = join(root, 'missing.ics');
  const { stdout, stderr } = await execFile(process.execPath, [
    join(process.cwd(), 'src', 'cli.mjs'), 'leverage', 'collect-calendar',
    '--file', missing, '--label', 'blocked-calendar', '--store', storePath,
  ], { encoding: 'utf8', timeout: 15000 });
  assert.equal(stderr, '');
  const result = JSON.parse(stdout);
  assert.equal(result.collected_count, 0);
  assert.equal(result.ingestion.collection_skipped, true);
  assert.equal(result.ingestion.skip_reason, 'application_excluded');
});
