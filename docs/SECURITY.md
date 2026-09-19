# Security model and current limits

This is an experimental fixture-scoped integration, not a hardened general device
controller. The native adapter has not yet compiled or run on iOS. Never install
it on an everyday phone to provoke a failure.

## Trust boundaries

Untrusted: model output, tool arguments, screen text, logs, application content,
source workspaces, network peers. Trusted for enforcement: installed immutable
helper, root-owned device policy, authenticated SSH service, kernel peer identity,
and the reviewed UI adapter. A compromised kernel/root/SpringBoard is outside the
boundary. Root code cannot be contained by path allowlists.

The gateway cannot issue grants. An independent administrator uses `owner.py`
through a separate credential. Its command is not accessible through the forced
SSH key or MCP. The device helper enforces audience, principal, credential hash,
expiry, device ID, grant app/scope/expiry, session/fence, STOP, and deadline on every
request. The native UI socket additionally permits only UID 0 peers and only the
fixed fixture app. All non-fixture workflows, including generic taps into sensitive
apps, are denied. No general shell, file, URL, package or approval MCP tool exists.

Host configuration must be root-owned with non-writable parents outside the
workspace. Runtime credential files may belong to the designated operator UID,
in a protected root-owned parent. Stdio authenticates via the launching OS account;
a session ID is not a credential. Separate the owner administrator from the agent
account. Do not grant the agent passwordless sudo or an unrestricted device SSH key.
A model with administrative host/device access can change code and policy; this
integration cannot make that a safe bounded session.

## Request handling

One active session per device (currently observers are serialized too), five-minute
lease maximum, monotonically increasing fence, zero-depth mutation queue. Only the latest observation is actionable; observations expire after 15 seconds. The helper reobserves and compares epoch,
app, PID, lock, screen and AX digest before dispatch, and rechecks grants/STOP after
that read. The UI component rechecks state/deadline and the protected shared lease at dispatch.
Owner stop/revoke and session cancellation disable that lease. A local stop strip
latches a persistent STOP file, with no model-accessible resume. Partial capture
and unknown lock state fail closed. Away-and-back transitions and the final gap
between state check and HID dispatch cannot be proven absent: supervised fixture
use only until hardware validation.

SQLite FULL synchronous commit places a pending mutation record before UI send.
A failed send/ack/verification is OUTCOME_UNKNOWN and closes the session. No automatic
replay. Same request ID with different arguments is REQUEST_CONFLICT. Pending
records survive helper restart. This is not universal exactly-once semantics: a
new request ID is a new operation; a crash after UI execution may leave uncertainty.
Request records are capped at 4096 and expire 24 hours after the original deadline;
expired envelopes are always rejected before dispatch.

Cancellation invalidates future session operations and observations without waiting
for the UI. A pre-aborted MCP request sends nothing. After a transport failure,
timeout or in-flight abort of a mutation, the gateway awaits one separate authenticated
session-cancel request (up to six seconds beyond the original action deadline).
It never replays the mutation. Its error distinguishes acknowledged cancellation
from unconfirmed cancellation. Neither establishes the original action's outcome.
The native input path checks that its helper socket is still connected before
input, including after a main-queue wait. This guard is host-tested as shared C
code; device timing and SSH-disconnect propagation are not hardware-verified.
If cancellation cannot reach the device, use independent owner stop or lease expiry. An atomic tap or one already dispatched Unicode event cannot be recalled.
No long-lived contact, multi-touch, drag, or queued typing is exposed. The tap
sequence releases its contact in `finally`. Device behavior on an actual connection
loss during dispatch remains untested. Never advertise a cancellation guarantee
stronger than this.

## Privacy and availability

Screenshots and screen text are returned to the MCP client and may reach its model
provider. Do not enter secrets into the test fixture. No screenshot or raw screen
text is written by the helper: observations retain only geometry, state and a tree
digest; ledger stores redacted outcomes. Geometry expires on subsequent requests;
no idle retention purge daemon exists. QuietLogger replaces upstream disk logging.
The client/model provider may retain tool content independently.

SSH errors are reduced to typed errors; raw stderr and request bodies are not
logged. No root signing keys, provider tokens, cookies or administrative credentials
are put on the phone by this project. A private SSH runtime key and separate scoped
device token live outside the workspace on the host. The device stores only the
helper-token hash and authorized SSH public key.

Direct upstream ports are forbidden. The generated package does not build
MCPServer.m, Tweak.x, root helpers, AppSync or installation subprojects. AppManager's
MIT module is linked for launch/state; its other methods have no dispatch route.
A pre-existing upstream installation can still expose a listener: owner must
inventory and disable/remove it before pairing. Package conflicts help but do not
prove network isolation. Actual unauthorized socket and LAN-port tests are pending.

Independent stop: owner CLI/local terminal, or authenticated helper cancellation.
Leaving the fixture or locking the phone blocks future UI requests. If SpringBoard
fails, owner SSH must remain reachable; this is designed independence, not tested
recovery. If SSH or jailbreak privileges disappear, physical intervention may be
required. No reboot, respring, unlock bypass, or bounded-retry recovery is automatic.

## Deferred security work

Real package/build review, sandboxing of deployed host binaries, device/UI identity
attestation, native memory safety/fuzzing, rate limiting before SSH authentication,
measured calibration, hardware validation of the local-stop strip and session indicator,
and authenticated operator web page. HTTP must not be added without per-request
identity/scope/audience validation, origin/CSRF protections and revocation tests.

Owner policy updates are serialized through a protected `owner.lock`, with policy
read after lock acquisition. They reject symlink policies, locks and journals.
Initialization checks all output locations before creating state; ordinary failure
cleanup touches only newly created files. Crash-atomic setup across multiple
directories is not claimed. Resume invalidates previous grants/sessions and keeps
the shared lease disabled, requiring a fresh grant. These owner paths have isolated
host lifecycle tests, not device provisioning evidence.
