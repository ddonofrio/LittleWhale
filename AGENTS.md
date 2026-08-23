# Little Whale repository rules

Little Whale is an English-only, local-model-first agentic development product. All code, comments, documentation, tests, configuration descriptions, and agent instructions owned by this project are written in English. User and model content remains fully Unicode-capable, including CJK content.

`upstream-mirror` packages are read-only and replaceable from the pinned canonical snapshot. Product changes belong in Little Whale packages, plugins, composition overlays, or tests. Changes to `adapted-upstream` packages must update the ownership manifest and provenance notes.

The effective product must not activate a DeepSeek cloud provider, DeepSeek telemetry, DeepSeek web search, or official DeepSeek onboarding. Do not add secrets or API keys to source files, tests, logs, or snapshots.

Behavioural changes require focused tests and documentation. Run the relevant focused checks during implementation and the applicable broad gate before completion. Use `pnpm upstream:plan`, `pnpm upstream:sync`, and `pnpm upstream:verify` for upstream updates; never cherry-pick upstream commits.

Mirrored packages retain their upstream MIT metadata. New Little Whale files and packages are GPL-3.0-or-later. Adapted packages retain upstream notices and must document the adaptation boundary.
