# Observation resilience review — 2026-09-23

## Trigger

The latest real-device session reached the restricted UI socket and verified the fixture was installed, but the bounded accessibility observation path returned `RECOVERY_REQUIRED`. The existing executor converted any compact-AX semaphore timeout directly into recovery-required before checking whether the fixture foreground/lock/screen state was still stable.

## Source change

`device/BridgeUI.m` now has a bounded state-only fallback for accessibility timeout, unavailable/empty payload, or invalid compact-element payload. The fallback:

- rechecks the active lease and request deadline;
- samples device state again and requires the exact same epoch, fixture bundle, PID, lock state and screen state;
- requires the device to remain unlocked with the benign fixture foreground;
- returns `elements: []`, `observation_mode: "state_only"`, an `ax_status` reason and `screenshot_status: "skipped"`;
- never synthesizes element references or coordinates.

Full AX observations identify themselves as `observation_mode: "full"` with `ax_status: "available"`.

## Safety invariants

The helper already derives tap targets only from persisted observation elements. Because a state-only observation has no elements, it cannot authorize a blind `tap_element` request. Fixture launch can still be verified from stable foreground process state. AX text postconditions remain unverified without AX elements and therefore do not become false positive successes.

STOP, lease revocation/expiry, deadline expiry, lock state changes, foreground changes, PID/epoch/screen changes, stale observations, mutation uncertainty and cancellation behaviour remain fail-closed.

## Regression coverage

`tests/test_degraded_observation.py` adds simulation-only checks that:

1. a state-only post-launch observation can verify the benign fixture reached the foreground;
2. a state-only observation cannot authorize a fabricated element reference or dispatch a tap;
3. the native source retains the explicit bounded state-only timeout fallback.

A GitHub Actions host CI workflow runs `npm ci`, `npm test`, and `npm run check` on the completion branch and pull requests.

## Verification classification

This review is source-level and simulated-host evidence only until CI finishes. It is **not** a native compilation pass, installed-package verification, accessibility hardware pass, tap calibration pass, or cross-network pass. The real-device observation gate remains open until an owner-approved native replacement is built/reviewed/installed and the hardware smoke sequence succeeds.
