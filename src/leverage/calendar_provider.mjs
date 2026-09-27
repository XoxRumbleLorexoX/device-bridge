import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

const DAY = 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function parseWindow(value, fallbackMs) {
  if (value === undefined || value === null) return new Date(fallbackMs).toISOString();
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string') {
    const days = /^(\d{1,4})d$/u.exec(value);
    if (days) return new Date(fallbackMs - Number(days[1]) * DAY).toISOString();
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  throw new TypeError('Calendar provider time bounds must be ISO timestamps, Dates, epoch milliseconds, or an Nd horizon for since.');
}

function validateCalendars(calendars) {
  if (!Array.isArray(calendars) || calendars.length < 1 || calendars.length > 16)
    throw new TypeError('Calendar metadata provider requires 1 to 16 explicitly configured calendar files.');
  const labels = new Set();
  return calendars.map(calendar => {
    if (!calendar || typeof calendar.path !== 'string' || !calendar.path.trim()) throw new TypeError('Each calendar requires an explicit .ics file path.');
    if (typeof calendar.label !== 'string' || !LABEL.test(calendar.label)) throw new TypeError('Each calendar requires a stable label using letters, digits, dot, underscore or hyphen.');
    if (labels.has(calendar.label)) throw new TypeError(`Duplicate calendar label: ${calendar.label}`);
    labels.add(calendar.label);
    return { label: calendar.label, path: calendar.path };
  });
}

function unfoldLines(text) {
  if (text.includes('\0')) throw new Error('Calendar file contains unsupported binary data.');
  const physical = text.split(/\r?\n/u);
  const logical = [];
  for (const line of physical) {
    if (/^[ \t]/u.test(line)) {
      if (!logical.length) throw new Error('Calendar file starts with an invalid folded line.');
      logical[logical.length - 1] += line.slice(1);
    } else {
      logical.push(line);
    }
  }
  return logical;
}

function property(line) {
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [rawName, ...rawParameters] = head.split(';');
  const name = rawName.toUpperCase();
  const parameters = {};
  for (const raw of rawParameters) {
    const at = raw.indexOf('=');
    if (at > 0) parameters[raw.slice(0, at).toUpperCase()] = raw.slice(at + 1);
  }
  return { name, parameters, value };
}

function dateFromParts(year, month, day, hour = 0, minute = 0, second = 0) {
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day || value.getUTCHours() !== hour || value.getUTCMinutes() !== minute || value.getUTCSeconds() !== second)
    throw new Error('Calendar event contains an invalid date/time.');
  return value;
}

function parseCalendarTime(entry) {
  if (!entry) return null;
  if (entry.parameters.TZID) throw new Error('TZID calendar times are unsupported; export UTC or all-day values.');
  const dateOnly = entry.parameters.VALUE === 'DATE' || /^\d{8}$/u.test(entry.value);
  if (dateOnly) {
    const match = /^(\d{4})(\d{2})(\d{2})$/u.exec(entry.value);
    if (!match) throw new Error('Calendar event contains an invalid all-day date.');
    return { date: dateFromParts(Number(match[1]), Number(match[2]), Number(match[3])), all_day: true, exact_time: false };
  }
  const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(entry.value);
  if (!utc) throw new Error('Floating/local calendar times are unsupported; export UTC (Z) or all-day values.');
  return {
    date: dateFromParts(Number(utc[1]), Number(utc[2]), Number(utc[3]), Number(utc[4]), Number(utc[5]), Number(utc[6])),
    all_day: false,
    exact_time: true,
  };
}

function parseDuration(value) {
  if (typeof value !== 'string') return null;
  const weeks = /^P(\d+)W$/u.exec(value);
  if (weeks) return Number(weeks[1]) * 7 * DAY;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/u.exec(value);
  if (!match) throw new Error('Calendar event contains an unsupported duration.');
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

function parseEvents(text, calendarLabel) {
  const lines = unfoldLines(text);
  const events = [];
  let current = null;
  let eventIndex = 0;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      if (current) throw new Error('Nested VEVENT blocks are unsupported.');
      current = { properties: new Map(), index: eventIndex++ };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (!current) throw new Error('Calendar file contains an unmatched VEVENT terminator.');
      events.push(finalizeEvent(current, calendarLabel));
      current = null;
      continue;
    }
    if (!current) continue;
    const parsed = property(line);
    if (!parsed) continue;
    if (!current.properties.has(parsed.name)) current.properties.set(parsed.name, parsed);
  }
  if (current) throw new Error('Calendar file contains an unterminated VEVENT.');
  return events.filter(Boolean);
}

function finalizeEvent(record, calendarLabel) {
  const get = name => record.properties.get(name);
  const status = get('STATUS')?.value?.toUpperCase();
  if (status === 'CANCELLED') return null;
  if (get('RRULE')) throw new Error('Recurring RRULE events are not expanded by this provider; export materialized instances instead.');

  const start = parseCalendarTime(get('DTSTART'));
  if (!start) throw new Error('Calendar event is missing DTSTART.');
  const end = parseCalendarTime(get('DTEND'));
  if (end && end.all_day !== start.all_day) throw new Error('Calendar event mixes all-day and timed DTSTART/DTEND values.');

  let durationMs;
  let durationKnown = true;
  if (end) durationMs = end.date.valueOf() - start.date.valueOf();
  else if (get('DURATION')) durationMs = parseDuration(get('DURATION').value);
  else if (start.all_day) durationMs = DAY;
  else { durationMs = 0; durationKnown = false; }

  if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error('Calendar event has an invalid negative/end-before-start duration.');
  if (durationMs > 7 * DAY) throw new Error('Calendar event duration exceeds the seven-day canonical event limit.');

  const uid = get('UID')?.value ?? `event-${record.index}`;
  const opaque = digest(`${calendarLabel}:${uid}:${start.date.toISOString()}`).slice(0, 32);
  const transparency = get('TRANSP')?.value?.toUpperCase();
  return {
    timestamp: start.date.toISOString(),
    duration_ms: Math.round(durationMs),
    all_day: start.all_day,
    exact_time: start.exact_time,
    duration_known: durationKnown,
    busy: transparency !== 'TRANSPARENT',
    opaque,
  };
}

async function readCalendarFile(calendar) {
  let handle;
  try {
    handle = await open(calendar.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('configured calendar path is not a regular file');
    if (info.size > MAX_FILE_BYTES) throw new Error('calendar file exceeds the 4 MiB provider limit');
    return await handle.readFile({ encoding: 'utf8' });
  } catch (error) {
    throw new Error(`Calendar metadata collection failed for ${calendar.label}; no calendar content was ingested.`, { cause: error });
  } finally {
    await handle?.close().catch(() => {});
  }
}

export class CalendarMetadataProvider {
  constructor({ calendars, device_id = 'host', privacy_class = 'PRIVATE', max_events = 500 } = {}) {
    this.id = 'calendar-metadata';
    this.calendars = validateCalendars(calendars);
    if (typeof device_id !== 'string' || !device_id.trim()) throw new TypeError('device_id is required.');
    if (!['PERSONAL', 'PRIVATE'].includes(privacy_class)) throw new TypeError('Calendar metadata provider privacy_class must be PERSONAL or PRIVATE.');
    if (!Number.isInteger(max_events) || max_events < 1 || max_events > 5000) throw new TypeError('max_events must be an integer between 1 and 5000.');
    this.device_id = device_id;
    this.privacy_class = privacy_class;
    this.max_events = max_events;
  }

  describe() {
    return {
      id: this.id,
      version: 1,
      collection_mode: 'explicit_local_invocation',
      local_only: true,
      declared_privacy_classes: [this.privacy_class],
      declared_applications: ['calendar'],
      data_exposed: ['calendar label', 'event start', 'event duration', 'all-day flag', 'busy/free flag', 'opaque event reference'],
      data_not_collected: ['event title/summary', 'description/notes', 'location', 'attendees', 'organizer', 'conference URL', 'alarms', 'attachments', 'raw UID'],
      limitations: ['UTC (Z) timed values and all-day DATE values only', 'RRULE recurrence is not expanded; export materialized instances', 'all-day dates use UTC-midnight placeholders and must not be treated as hour-of-day observations'],
      interpretation: 'Calendar timing metadata describes scheduled blocks; it does not establish importance, productivity, intent, attendance, or meeting quality.',
    };
  }

  async collect({ since = '30d', until, now = Date.now() } = {}) {
    const nowMs = now instanceof Date ? now.valueOf() : Number(now);
    if (!Number.isFinite(nowMs)) throw new TypeError('now must be a Date or epoch milliseconds.');
    const sinceIso = parseWindow(since, nowMs);
    const untilIso = until === undefined ? new Date(nowMs).toISOString() : parseWindow(until, nowMs);
    const sinceMs = Date.parse(sinceIso);
    const untilMs = Date.parse(untilIso);
    if (untilMs < sinceMs) throw new RangeError('Calendar provider until must not be before since.');

    const output = [];
    for (const calendar of this.calendars) {
      if (output.length >= this.max_events) break;
      const text = await readCalendarFile(calendar);
      let parsed;
      try {
        parsed = parseEvents(text, calendar.label);
      } catch (error) {
        throw new Error(`Calendar metadata parsing failed for ${calendar.label}; no event content was emitted.`, { cause: error });
      }
      for (const event of parsed) {
        if (output.length >= this.max_events) break;
        const startMs = Date.parse(event.timestamp);
        const endMs = startMs + event.duration_ms;
        if (endMs < sinceMs || startMs > untilMs) continue;
        output.push({
          timestamp: event.timestamp,
          device_id: this.device_id,
          source: this.id,
          application: 'calendar',
          action_type: 'calendar_block',
          object: calendar.label,
          context: {
            calendar_label: calendar.label,
            all_day: event.all_day,
            busy: event.busy,
            duration_known: event.duration_known,
            time_basis: event.all_day ? 'date_only_placeholder_utc_midnight' : 'exact_utc',
            activity_category: 'Schedule',
            activity_subcategory: 'Calendar Block',
            metric_semantics: 'calendar_timing_metadata_not_importance_or_productivity',
          },
          duration_ms: event.duration_ms,
          confidence: event.exact_time ? 1 : 0.8,
          privacy_class: this.privacy_class,
          raw_event_ref: `calendar-event:${event.opaque}`,
        });
      }
    }
    return output.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(0, this.max_events);
  }
}
