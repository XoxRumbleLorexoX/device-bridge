# Acceptance procedure and evidence classification

Run only after verified pairing, reviewed installation, and a five-minute owner
fixture control grant. Unlock locally; no passcode or biometric actions are offered.
Watch the entire first run. Hardware tests are not part of `npm test` and have not
run yet. Capture latency/bandwidth/battery measurements are not available.

## B: real local vertical slice

1. Record device hardware/iOS build/bootstrap, package architecture, host toolchain,
   source/artifact hashes and SDK protocol negotiation. Run status/capabilities.
   Confirm native capabilities remain unverified before this test.
2. Verify missing/revoked helper credentials fail. Verify an unrelated unprivileged
   device process cannot call the UI socket (`getpeereid` must reject it), and no
   old unauthenticated root/MCP listener is reachable from the host or another LAN
   device. Do not call upstream mutation endpoints merely to test their presence.
3. Open a session with the owner grant ID. Store session ID/fence. Every new request
   needs a UUID and deadline within 30 seconds; do not reuse IDs for new actions.
4. Use fixture launch from Home. Verify the foreground and unlocked state. Observe
   native image and elements. The strip must be visible and local stop functional.
5. Select the exact observed reference for Target 0. Request an exact postcondition
   `Target 0: 1`. Record before/after evidence and actual event location. Do not infer
   accuracy from successful transport. Repeat fresh observations for targets of
   12/20/28 display points in portrait and supported landscape orientations.
6. Tap the observed test-input reference, capture again after keyboard appearance,
   insert `Ž 中文 👩🏽‍💻` with exact expected echo text. Verify no submission occurred.
   Switch the keyboard locally and repeat with a new observation. Never retry
   uncertain text input automatically.
7. Rotate/switch apps between observe and action: expect STALE_OBSERVATION or denial.
   Lock locally: expect DEVICE_LOCKED. Unsupported drag/multi-touch must not dispatch.
   Long press/drag are not yet implemented or advertised and therefore not passes.
8. Cancel; confirm old session/ref/fence fails. Open another owner-permitted session
   after the old lease is cancelled. Use local STOP and verify no further input,
   including after UI restart where separately approved.
9. Revoke owner credential and remove runtime SSH key. Confirm rejection. Restore
   only through independent owner pairing. Execute the uninstall checklist and
   compare unrelated configuration before/after.

## C: genuinely separate networks (blocked on B)

Owner enrolls supported host/device or a device-LAN host in an approved maintained
private overlay. Tailscale is the selected candidate; do not create accounts or
change router rules automatically. Repeat B with the operator and controlled endpoint
on different networks (record topology; a local proxy/USB run does not qualify).
Keep the host, SSH service and unlocked jailbroken runtime online. Check key expiry,
cellular/Wi-Fi transition, reconnect and IP change. A request whose acknowledgement
is dropped returns OUTCOME_UNKNOWN; inspect its journal, do not replay it. Stale
session/epoch/deadline/ref rejection must still hold after reconnect.

Do not publish an HTTP/root backend. No authenticated Streamable HTTP or operator
web page is implemented yet. A task started through a real Codex client via stdio
is useful integration evidence but is not the required later web-operator task test.

## D and E: not yet implemented

Scoped files/plists, expected-content collisions/backups/restore, calibrated paths,
long press/drag/cancel, package script preflight, approved benign tweak deployment,
verified effective change and previous-version rollback, bounded logs/debugging,
responsive authenticated operator page with real agent execution. Add each only
through its gate. Do not describe interface plans as acceptance evidence.

## Evidence format

Record date, source commit/hash, device/build/bootstrap, test category, command,
expected/actual state, request ID, verification result, and limitations. Screenshots
are opt-in and must exclude personal content. Separate:

- Unit: authorization, bounds, input schema, result formatting.
- Simulated integration: SDK stdio plus real helper with test UI; Unix framing.
- Actual device: native build/install/UI execution and independent recovery.
- Actual cross-network: topology and disconnect/reauth evidence.

The latter two currently have zero passes. Skipped/blocked tests are never passes.
