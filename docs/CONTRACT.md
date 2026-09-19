# Contract v1

MCP names are stable; optional powers stay in capability discovery until implemented
and checked. Tools: `bridge_devices`, `bridge_capabilities`, `bridge_status`,
`bridge_session_open`, `bridge_observe`, `bridge_element_tap`, `bridge_text_insert`,
`bridge_app_launch`, `bridge_cancel`, `bridge_request_result`.

Inputs use strict Zod schemas. Requests carry device ID, UUID request ID and a wall
clock deadline within 30 seconds. UI requests also carry session ID, fence, scope,
and an observation ID except fixture launch. Clocks must be synchronized; no expired
request replay is attempted. Operator identity/credential/audience are added by the
transport, never accepted from model tool arguments.

Helper envelope:

```json
{
  "version": 1,
  "audience": "device-bridge/helper/v1",
  "device_id": "paired UUID",
  "principal": "owner-issued name",
  "credential": "secret supplied over SSH stdin only",
  "request_id": "new UUID",
  "deadline": 0,
  "method": "act",
  "session_id": "owner-grant session UUID",
  "fence": 1,
  "scope": "control",
  "observation_id": "fresh UUID",
  "action": {"kind": "insert_text", "text": "Ž 中文"},
  "expected_text": "Ž 中文"
}
```

Deadline 0 above is explanatory and intentionally invalid. Never copy the credential
into a URL, argument list, repo or log. Internal AF_UNIX messages are four-byte big
endian length followed by JSON; request limit 256 KiB, response limit 20 MiB. Root
peer UID is mandatory. The UI executor is serialized separately from the helper.

A result carries status, device/request identity, elapsed time, data or typed error
with `code`, `stage`, `next_step`. Mutation data distinguishes `dispatched` and
`verified`. `executed` is reserved for backends with stronger evidence. An exact
AX text match verifies the requested text postcondition; it does not prove a broader
user task completed. Failed postcondition with successful dispatch returns dispatched.
A missing acknowledgement or failed after-observation returns OUTCOME_UNKNOWN.

Observation: observation ID, SpringBoard random process epoch, app PID, foreground
bundle, lock, capture time, screen point dimensions, scale/native scale/orientation,
compact elements with scoped refs, non-atomic consistency flag, optional native PNG
and image-to-screen affine scale/offset. No safe-area/keyboard occlusion or calibrated
accuracy claim. Crop/streaming/AX-native actions are not implemented. Images use MCP
image content; image metadata stays in structured content.

Errors include DEVICE_OFFLINE, DEVICE_LOCKED, UNSUPPORTED_CAPABILITY,
STALE_OBSERVATION, APPROVAL_REQUIRED, PERMISSION_DENIED, OUTCOME_UNKNOWN,
RECOVERY_REQUIRED, CANCELLED, DEADLINE_EXCEEDED, WRITER_BUSY, REQUEST_CONFLICT, INVALID_ARGUMENT.

Each capability reports source implementation, backend (top-level), status,
prerequisites, limitations and last_verification. All implemented native features
remain **unverified**, not supported, until a named device/build passes the hardware
suite. Hardware evidence does not automatically generalize to another configuration.

`CANCELLED` before transport means nothing was sent. Once a mutation may have been
sent, transport failure remains `OUTCOME_UNKNOWN`, even when the gateway confirms
a separate session cancellation. That bounded cancellation is awaited, not detached.
