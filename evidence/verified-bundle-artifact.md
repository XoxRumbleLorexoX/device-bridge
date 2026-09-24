# Verified native source bundle artifact

This handoff is source-only. It does not build an iPhone binary or package, access a
phone, install/activate anything, change credentials or grants, or issue UI input.

CI first verifies the deterministic source bundle against the exact pinned `ios-mcp`
commit. The exact archive bytes that pass that check are then retained together with
a SHA-256 sidecar as a workflow artifact. The artifact wrapper created by GitHub is
not itself the reproducibility boundary; `device-bridge-build.tar.gz` and its recorded
SHA-256 are.

The owner should verify the SHA-256 after downloading and again after transfer to the
phone before extracting into a fresh mobile-owned directory. Native package creation
remains a separate owner-operated step via `package-candidate.sh`, and deployment or
activation still requires the existing specific artifact review/approval boundary.
