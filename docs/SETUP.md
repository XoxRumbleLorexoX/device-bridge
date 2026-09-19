# Setup and first use

**Current gate:** host tests work; fixture and executor compiled/signed on iOS 16.2 using SDK 16.5, but have not been installed or run. The host lacks
Theos and an iPhoneOS SDK. The reachable owner's phone is not yet paired: SSH
authenticated agent access is still needed. The owner accepted a matching saved
ECDSA pin with unknown prior trust history; mobile key-based login failed. Owner
reports Theos and an iPhoneOS16.5 SDK directory on the phone; compilation is unverified. Do not
interpret the following conditional installation recipe as an installation result.

## Run the tested host portion

From `device-bridge/`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
node src/cli.mjs setup
node src/cli.mjs doctor
node src/cli.mjs connect codex
```

Use `node src/cli.mjs` as `bridge` throughout this guide. No global install is needed.
The setup command diagnoses prerequisites and links the owner provisioning steps;
it does not yet automate full installation. Host tests use a simulated UI and do
not connect to your phone. The production CLI has no simulation switch.

## Verify and inventory the actual phone

1. In the phone's local terminal, find the SSH host public key under the bootstrap's
   actual SSH configuration directory. Run `ssh-keygen -lf PATH_TO_ED25519_HOST_KEY.pub`.
   Compare its SHA256 fingerprint to the network probe using an independent display.
   Never send a private key or password into an agent conversation.
2. Pin only the locally verified key, to a new owner-selected file:

   ```sh
   node src/cli.mjs pair --host DEVICE_ADDRESS --port 22 --fingerprint 'SHA256:VERIFIED_VALUE' --output /private/tmp/device-bridge-known-hosts
   ```

   ED25519 is the default. For an independently owner-verified ECDSA key, add
   `--key-type ecdsa`; no algorithm fallback occurs. The scan must contain exactly
   one key for the requested endpoint, and its algorithm and SHA256 must match.
   Existing output files are never overwritten.

   This does not log in, issue grants, or complete device pairing. Existing output
   files are not overwritten. A mismatch stops setup. Independently install the
   public known-hosts file under `/etc/device-bridge/known_hosts` later.
3. Through an existing owner-authenticated SSH account, run the reviewed read-only
   `scripts/probe-device.sh`. It reports hardware, kernel build, bootstrap paths,
   Python/sqlite and tools, without reading personal app data. Confirm the jailbreak
   type locally. Do not infer rootless/rootful support from the model name.
4. Record actual package architecture and hook runtime. Inventory existing upstream
   listeners. Disable/remove competing ios-mcp/jb-p1lot components through their
   owner controls before installing this executor. Keep an independent administrative
   SSH session open. Do not activate the original unauthenticated HTTP server.

## Build only after prerequisites are available

Install an appropriate Xcode/iPhoneOS SDK and Theos in an owner-approved location.
Neither was automatically downloaded. Confirm `xcrun --sdk iphoneos --show-sdk-path`
and the SDK/deployment target match the device and its bootstrap. Initial build
recipe targets arm64/arm64e and iOS 15+, but neither scheme has been hardware-tested.
Roothide relocation is not implemented in this integration build.

```sh
python3 scripts/prepare_executor.py --output build/executor-reviewed
make -C build/executor-reviewed THEOS=/ABSOLUTE/THEOS THEOS_PACKAGE_SCHEME=rootless package
make -C fixture THEOS=/ABSOLUTE/THEOS THEOS_PACKAGE_SCHEME=rootless package
```

For a confirmed rootful target, use its appropriate Theos package scheme and verify
package architecture; do not silently install the rootless recipe. The source
preparer refuses a different upstream revision or edited reused file. It creates
a NEW directory, copies the MIT modules and notices, applies the documented AX
bootstrap patch, and records file hashes. Existing output is never overwritten.
It excludes the original server/tweak entry, root helpers and installation/signature
bypass subprojects. Theos itself still needs an authorized signing toolchain.

No package scripts are supplied by this integration. Inspect the generated package
control/scripts and archive paths before privileged install. Record artifact SHA256,
source manifest and any existing bridge package version. Source compilation and
Theos-generated maintainer-script behavior must be reviewed before installation.
Never run upstream `build.sh`, `bootstrap.sh`, or a broad `make install` by default.

## Independent owner provisioning (after build/preflight approval)

The following is an explicit deployment boundary. The owner must install reviewed
artifacts through an independent administrative channel. The agent's runtime key
must never have these permissions.

- Choose the discovered absolute Python 3 path; verify `sqlite3`, `socket`, `fcntl`
  and `signal` are available. Install `device/helper.py` and `device/owner.py` as
  root-owned, non-agent-writable files under an owner-selected prefix. Protect all
  parent directories. Do not execute editable workspace Python as root.
- Initialize a root-owned state directory, e.g. `/var/root/device-bridge`, and a
  public root-owned 0755 `/var/db/device-bridge` lease directory. Let the owner CLI
  create both: the state and shared lease directories must not already exist.
  The credential output must be a new file in an existing protected owner directory. Initial pairing creates a random device ID and a distinct
  24-hour helper credential; it never prints the credential:

  ```sh
  /ABSOLUTE/PYTHON3 -I /INSTALLED/owner.py init --state /var/root/device-bridge --principal operator --credential-output /OWNER_ONLY_NEW_CREDENTIAL_FILE
  ```

  Initialization validates those paths before writing. Existing files, broken
  symlinks and pre-existing lease directories are rejected rather than overwritten.
  On an ordinary failed initialization it removes only files/directories it created;
  after a crash, preserve and inspect any partial state before retrying. This is
  not a cross-filesystem crash transaction.

- Generate a **dedicated** SSH key on the gateway host outside the workspace.
  Install only its public key into the device's actual root `authorized_keys`,
  preserving existing owner entries. Use an entry of this form with reviewed paths:

  ```text
  restrict,command="/ABSOLUTE/PYTHON3 -I /INSTALLED/helper.py --state /var/root/device-bridge" ssh-ed25519 PUBLIC_KEY device-bridge-runtime
  ```

  Verify OpenSSH supports `restrict`; it must deny PTY, forwarding, agent forwarding,
  user rc and arbitrary shell commands. The helper ignores SSH_ORIGINAL_COMMAND.
  Do not reuse an unrestricted administrative key or change sshd authentication
  defaults to get this working. Root is used only to authenticate to the UI Unix
  socket and protect policy; there is no root shell RPC. Python still increases
  the trusted computing base; native helper replacement is future work.
- Transfer the helper credential securely to the host using the independent owner
  channel, then remove any unnecessary transfer copy. Keep it and the private SSH
  runtime key under `/etc/device-bridge/runtime/` in files owned by the operator UID,
  mode 0600, with root-owned non-writable parents. They authorize only existing
  fixture grants. Do not put either value into the model prompt, URLs or config.
- Fill `docs/gateway.example.json` with the paired device ID, principal, address,
  operator UID and paths. Install it root-owned 0644 under
  `/etc/device-bridge/gateway.json`; known_hosts root-owned 0644. Gateway refuses
  writable policy, symlinks or agent-writable parent directories. Credentials have
  a different ownership rule so the operator process can read them.
- Install reviewed fixture and UI packages. Activation method and exact dpkg paths
  depend on inventory. Do not respring until independent SSH status/stop is verified
  and a known-good package/removal path is documented. No automatic activation is
  provided or claimed.

## Issue a short owner grant and smoke-test

On the independent administrative channel:

```sh
/ABSOLUTE/PYTHON3 -I /INSTALLED/owner.py grant --state /var/root/device-bridge --principal operator --minutes 5 --control
```

Read-only is the default without `--control`. Grants are restricted to
`dev.devicebridge.fixture`. There is no option to allow arbitrary apps/root tools.
Return only the non-secret grant ID to the agent. On the host:

```sh
node src/cli.mjs status --config /etc/device-bridge/gateway.json
node src/cli.mjs capabilities --config /etc/device-bridge/gateway.json
node src/cli.mjs connect codex --config /etc/device-bridge/gateway.json
```

`connect codex` prints configuration; it does not modify your config.toml. Before
adding its table, back up your current Codex config with owner-only permissions,
check that `mcp_servers.device_bridge` is unused, and preserve unrelated entries.
Do not copy a whole replacement config or enable bypass flags. To validate generated
configuration without touching the live config, run
`node scripts/check-codex-config.mjs`; it uses temporary command-line overrides
under a unique test server name, without changing HOME or CODEX_HOME. In the live installed client, inspect
`codex mcp get device_bridge` and `/mcp` after the owner adds the entry.

Perform `docs/SMOKE.md` while watching the phone. The fixture has no network access
code, account actions, saved data, or submission workflow. Do not treat simulated
results as permission to run unsupervised. If an input cannot be verified, stop
and inspect rather than retrying it.

## Optional owner-operated on-device compile check

The host build is preferred. This phone reports a local Theos/SDK installation, so
a build-only experiment is available without installing packages. Prepare a NEW
archive from the host workspace:

```sh
python3 scripts/prepare_device_bundle.py --output build/owner-build-source.tar.gz
```

Transfer it through the owner SSH connection, verify the printed archive SHA256,
and extract into a fresh mobile-owned directory as mobile. Inside the extracted
device-bridge-build directory run `THEOS=/var/theos sh build-check.sh`. The script
rejects uid 0 and requests only make all for fixture and executor with SDK 16.5.
It does not prove rootless bootstrap compatibility or signing/deployment readiness.
Preserve complete compiler errors; do not install partial artifacts. The archive
contains no SDK, credentials or compiled packages.
