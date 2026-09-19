# Owner recovery-helper setup

Prepared and staged; not installed. This is a new privileged bridge deployment,
separate from the fixture approvals. The owner authorizes it by running the exact
hash-verified sudo command in their own terminal; no password goes to the agent.

Generator: scripts/prepare_helper_setup.py. Reviewable template:
scripts/owner_helper_setup.py. Embedded payload consists only of device/helper.py,
device/owner.py and LICENSE, each with SHA256 verification. No secret is embedded.
Prepared v2 SHA256:
9fc62b5dd1a9b5a09bc10729114671c4cd12f66bb77edafe83651c9eb922e981.

## Changes and checks

Creates only these new root-protected locations, refusing pre-existing targets:

- /var/jb/usr/libexec/device-bridge: helper.py, owner.py, LICENSE (root-owned0644).
- /var/root/device-bridge: private0700 policy, SQLite journal and persistent STOP.
- /var/root/device-bridge-credentials: private0700 revoked test credential and
  setup-result.json (0600). Never paste the credential file into chat.
- /var/db/device-bridge: public0755 directory with disabled0644 lease JSON.

Runs the installed helper/owner using isolated Python subprocesses with bounded
timeouts. Checks missing credential rejection, authenticated status without UI,
no-grant session denial, independent stop, cancellation, revocation and final state.
Finishes with root STOP present, lease disabled, credential revoked and no grants.
No resume, screenshots, taps, package installation, SSH config/authorized_keys edit,
network listener, SpringBoard hook, respring or reboot is performed by this setup.
An initial credential exists briefly in root-only storage for these checks; it is
revoked before successful completion. Failed setup attempts stop/revoke best-effort,
retains evidence, and never claims the state is safe without passing final checks.

This proves only independent helper behavior when the owner actually runs it.
It does not establish remote runtime pairing or recovery from a real SpringBoard
crash. The source has already passed isolated mobile-user tests; those are not
privileged deployment evidence.

## Failure / recovery

On failure, do not repeat or remove directories automatically. Preserve root
state and review it. No arbitrary install scripts are transactional. An owner can
invoke the installed owner.py stop or revoke through the independent terminal;
these do not require the UI component. After successful setup, stop is already set.

For removal, first run owner.py uninstall --state /var/root/device-bridge through
the owner terminal. There are no newly registered services or SSH keys to disable
at this stage. Archive setup-result/state privately if desired, then remove only
the exact helper files and owner-created state/credential/shared directories after
checking they contain no unrelated files. Never delete the parent /var/root,
/var/db or /var/jb/usr/libexec directories. Actual removal remains untested.

Next gate: independently provision a restricted forced-command runtime key and
separate helper credential, verify remote status/auth-denial/stop/revoke, and only
then review UI executor installation/activation and a short fixture grant.
