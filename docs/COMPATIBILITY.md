# Compatibility matrix

| Configuration | Source implementation | Available/probed | Actually tested |
|---|---|---|---|
| macOS host, Node 20.5.0, Python 3.11.4, Codex 0.155.1 | stdio gateway, CLI, SSH client, policy helper | Yes | Unit and simulated integration; generated Codex schema accepted |
| Owner phone: reported iPhone14,3 / build 20C65 | Intended ios-mcp restricted executor | Owner reports root terminal, /var/jb, Python 3.9.9 with required imports, SQLite 3.39.5, clang 16 targeting arm64 iOS16; SDK/Theos unverified; accepted ECDSA pin matches; bridge SSH authentication failed | Owner-pasted inventory only; no bridge login, native build, install or UI test |
| iOS 15+ rootless arm64/arm64e | Theos build recipe | iPhoneOS SDK/Theos absent; actual bootstrap unknown | None; unverified |
| Rootful iOS | Upstream modules contain mechanisms; scheme needs actual-target preflight | Unknown | None; unverified |
| Roothide | Upstream supports its conventions; bridge build has no relocation recipe | Not enabled | Unsupported by current bridge build |
| Non-jailbroken iOS / WDA | mobile-mcp evaluated, no bridge adapter | Not implemented | Unsupported |
| Android / simulators | mobile-mcp evaluated, no bridge adapter | Not implemented | Unsupported |
| Host-assisted Tailscale + ordinary SSH | Architecture selected; config accepts reachable overlay address | No Tailscale or enrollment verified | No cross-network tests |
| Phone-originated relay / standalone agent | Not implemented | No | Unsupported |

The code probes lock, foreground, epoch, screen and AX dynamically. Hardware/iOS
build/bootstrap inventory must precede installation. An iPhone model or upstream
claimed version range is not compatibility evidence. Native capabilities report
unverified until actual configuration-specific evidence exists.
