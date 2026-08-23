# Architecture

Little Whale is a product fork built on the DeepSeek Harness architecture, not a separate agent runtime wrapped around it.

It retains the generic runtime and web interaction stack as replaceable upstream packages: agents, sessions, tools, workspaces, conversation rendering, plans, jobs, skills, and subagents. The Cordis plugin model remains the principal extension mechanism, preserving compatibility with the upstream ecosystem wherever Little Whale keeps the same contract.

Little Whale applies its product behaviour through a final composition layer and a small set of owned packages. These provide local-model defaults, onboarding, branding, English product copy, privacy choices, and behaviour intended for smaller models without rewriting the upstream chat experience.

## Ownership boundary

Each retained package is classified as an unchanged upstream mirror, Little Whale-owned code, an explicitly adapted upstream package, or an excluded component. This boundary allows compatible upstream improvements to be imported without overwriting the product layer.

The machine-readable classification is stored in `upstream/manifest.yml`; the pinned revision and package hashes are stored in `upstream/lock.yml`.

For the full technical architecture, see [`docs/architecture.md`](https://github.com/ddonofrio/LittleWhale/blob/main/docs/architecture.md). For the fork and compatibility policy, see [`UPSTREAM.md`](https://github.com/ddonofrio/LittleWhale/blob/main/UPSTREAM.md).
