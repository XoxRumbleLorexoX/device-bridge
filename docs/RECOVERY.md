# Stop, revoke, recover, uninstall

No reboot or respring is automatic. No recovery from loss of jailbreak, SSH service,
power or hardware connectivity is promised. Use a disposable fixture target for
failure injection; everyday-device crash testing requires separate explicit approval.

## Stop now

- In the agent or host terminal: `bridge_cancel` or
  `node src/cli.mjs stop --session SESSION_UUID --config /etc/device-bridge/gateway.json`.
  MCP aborts and uncertain mutation transport failures also attempt one bounded,
  authenticated cancellation. Check whether that cancellation was acknowledged;
  an unreachable phone cannot acknowledge stop.
  Future requests fail after cancellation, the native shared lease is disabled, and old observations
  are removed. A dispatched atomic event cannot be recalled.
- Local UI source includes a red **BRIDGE ACTIVE • TAP TO STOP** strip for active
  fixture sessions. It latches a local STOP file and cannot approve or resume
  control. It is not hardware-validated. Leaving the fixture pauses input, but an
  existing control grant may reopen it from Home; use STOP for revocation.
- On the independent owner terminal/SSH channel:

  ```sh
  /ABSOLUTE/PYTHON3 -I /INSTALLED/owner.py stop --state /var/root/device-bridge
  ```

  This disables the shared lease, clears grants, invalidates sessions and writes
  persistent STOP. It does not need SpringBoard. The root state directory is not
  writable through any MCP tool. The local UI STOP survives a SpringBoard restart.

## Revoke and rotate

```sh
/ABSOLUTE/PYTHON3 -I /INSTALLED/owner.py revoke --state /var/root/device-bridge --principal operator
```

Also remove only the exact `device-bridge-runtime` authorized_keys entry when
revoking SSH access. Preserve all other keys. Helper revocation applies even when
the old restricted SSH key still authenticates. Test both missing and revoked
helper credentials and arbitrary SSH commands/forwarding before enabling a grant.

For rotation, generate a fresh dedicated SSH key and stage its restricted public
entry through the owner channel, pin the same verified device host key, then:

```sh
/ABSOLUTE/PYTHON3 -I /INSTALLED/owner.py rotate --state /var/root/device-bridge --principal operator --credential-output /NEW_OWNER_ONLY_FILE
```

Securely transfer the new token, update host runtime files, remove the previous SSH
runtime public key, and issue a new short grant. Rotation clears grants and sessions.
Never put private values into a command line or report. The helper token expires
in 24 hours; this prototype does not silently auto-renew it.

Owner operations use an exclusive administrative lock and reread policy after
acquiring it. A competing operation fails with a retry instruction instead of
silently overwriting grants or revocation. The native lease is disabled before
stop/revoke/rotation changes. If a later journal update fails, control remains
disabled and the CLI reports failure; preserve the state for inspection. A failed
rotation may leave its newly created credential output, so inspect it before
choosing a new output path. Existing credential files are never overwritten.

`resume` clears all old grants and sessions before removing root STOP. It never
restores prior authorization. Fresh owner approval is required afterward, and
an independently latched local UI stop still needs owner-reviewed recovery.

## Recover after UI failure

1. Stop/revoke first using the independent path. Save only bounded metadata:
   request ID, error stage, package/source hashes, device build and timestamps.
   No raw screen text or screenshots by default.
2. `bridge status` can establish helper availability even without the UI socket.
   If SSH fails, check online/network/jailbreak state locally. A timeout after a
   mutation is OUTCOME_UNKNOWN, not an invitation to repeat it.
3. Inspect the single bridge package and its known-good version using the owner
   tools. No crash collection/debugger is exposed in this milestone. Do not use
   arbitrary root scripts to guess at a fix.
4. The local STOP file is `/var/mobile/Library/DeviceBridge/STOP`; only after owner
   review and grant revocation may the owner remove that exact file. A latched
   native component also requires a controlled reload. Do not respring without
   verifying SSH independence and receiving specific approval.
5. After the approved activation/recovery, the owner can clear root STOP with
   `owner.py resume --state /var/root/device-bridge`, then issue a fresh grant.
   This does not bypass a local UI stop latch. The new SpringBoard epoch invalidates
   old observations; session fencing prevents old lease use.
6. One reviewed recovery attempt, then stop and preserve evidence. Physical
   intervention is required if the known-good removal/restore path fails or SSH
   privileges are gone. Rollback has not yet been demonstrated on hardware.

## Uninstall without collateral changes

The public `bridge uninstall` and `bridge revoke` intentionally route to this
independent owner procedure; they cannot authorize themselves.

1. Run `owner.py uninstall --state /var/root/device-bridge` over the owner channel.
   It stops and revokes but deliberately does not delete package/configuration data.
2. Remove exactly the bridge runtime public-key entry from authorized_keys.
3. Remove only `dev.devicebridge.ui` and `dev.devicebridge.fixture` using the actual
   bootstrap's package manager after reviewing removal scripts and activation needs.
   Restore the recorded prior package version if testing an upgrade, using its
   saved artifact hash. No arbitrary package scripts are considered transactional.
4. Remove only the `mcp_servers.device_bridge` table from the owner's backed-up
   Codex configuration (if it was added), preserving other entries.
5. Once no process uses them, remove the owner-installed helper files and the exact
   bridge-only state/lease/socket directories, runtime key and token. Keep redacted
   evidence if desired. Do not recursively remove general SSH, Codex, or user-data
   directories. The workspace/build outputs can be archived or removed separately.
6. Verify SSH key rejection, absence of UI socket/package, and unchanged unrelated
   Codex configuration. Fresh install/reinstall/uninstall on hardware are pending,
   not counted as passes.
