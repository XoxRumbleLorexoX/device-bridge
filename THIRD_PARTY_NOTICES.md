# Third-party notices and reuse boundary

`upstreams.json` pins all inspected revisions. Only project-owned MIT UI modules
from **ios-mcp**, Copyright (c) 2026 witchan, are reused. Preserve the full license
and attribution in `notices/ios-mcp-LICENSE`, `notices/ios-mcp-NOTICE` and the upstream
third-party summary when sharing prepared source. The preparer copies them into
the build tree and emits a per-file source hash manifest.

New gateway/helper/fixture/integration sources are provided under the MIT License
in LICENSE. This does not relicense upstream components.

Local changes: replace original Tweak.x/MCPServer entry with BridgeUI.m; use
QuietLogger.m instead of disk logging; disable the pinned AccessibilityManager.m
`MCPEnableAXUIClientBootstrap` flag by a checked single-anchor patch. Other reused
modules are byte-verified against the pinned Git objects before copying. Native
input/launch modules retain methods beyond the narrow adapter but those methods
have no exposed dispatch route. No installer helpers are included.

Upstream ios-mcp also vendors GPL AppSync/appinst, AGPL ldid, Apache OpenSSL, LGPL
libplist, and BSD-style libzip. **None are copied or bundled by this integration's
source preparer.** Do not distribute the full original upstream package while
claiming it is all MIT. Any future reuse/linking/distribution of these components
requires their notices and corresponding source/relinking obligations to be
reviewed. Process separation is not an exemption.

jb-p1lot is GPL-3.0 and includes its own ScreenMirror/MCP SDK notices. Its architecture
was evaluated; no source is copied, linked or shipped here. mobile-mcp is Apache-2.0;
its adapters were evaluated and no source is copied. If either is added later,
re-evaluate combined distribution obligations before merging or packaging.

Host runtime dependencies are pinned with integrity hashes in package-lock.json:
Model Context Protocol TypeScript SDK 1.30.0 (MIT), Zod 4.1.13 (MIT), and their locked
transitive packages. Direct license texts are in notices; installed transitive
packages carry their own licenses. No node_modules or native binaries are being
redistributed. Before publishing an offline binary/dependency bundle, collect all
transitive notices and audit the distribution contents.

Theos/Logos, Apple SDK frameworks, OpenSSH, Python/sqlite and the jailbreak's hook
runtime are external build/runtime prerequisites. No Apple SDK, signing key,
OpenSSH server binary or jailbreak exploit is redistributed. The host-assisted
Tailscale option requires a separately installed, owner-enrolled client.
