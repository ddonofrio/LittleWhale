# Upstream relationship and compatibility

Little Whale is an independent fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), maintained by Diego Lucio D'Onofrio. It is not an official DeepSeek product and is not affiliated with or endorsed by DeepSeek.

## Why the project is a fork

DeepSeek Harness provides a strong agent runtime, a mature web client, Cordis-based composition, tools, sessions, plans, subagents, and a broad package ecosystem. Its product defaults and onboarding are primarily oriented towards frontier-class hosted models. It can use local providers, but local inference is a secondary configuration path rather than the central product experience.

Little Whale has a narrower purpose: provide a serious agentic coding assistant for small, locally hosted models. That requires different defaults, onboarding, context discipline, provider configuration, privacy expectations, and model-oriented development priorities.

A fork is appropriate because Little Whale needs to change the product direction while preserving the upstream architecture and continuing to benefit from compatible upstream improvements.

## What Little Whale preserves

Little Whale deliberately retains major DeepSeek Harness capabilities, including:

- The agent and session runtime.
- Cordis plugins and composition layers.
- The web conversation and tool experience.
- Workspaces, plans, goals, jobs, skills, and subagents.
- LLM and provider abstractions.
- Extension seams and package contracts that remain useful for the local-model product.

## What Little Whale changes

Little Whale owns the product-facing layer:

- Local-model-first onboarding and defaults.
- OpenAI-compatible local and LAN provider configuration.
- Behaviour intended for smaller, capacity-constrained models.
- Little Whale branding and English product documentation.
- Privacy defaults with no official DeepSeek cloud service or telemetry enabled during normal startup.
- The final composition that selects, replaces, or disables upstream components.

## Plugin and extension compatibility

Compatibility with DeepSeek Harness plugins and extensions is a design goal. Little Whale preserves the Cordis plugin system and keeps inherited identifiers such as `dsh`, `DSH_*`, and `@deepseek-ai/*` when they form part of a technical contract.

Compatibility applies to surfaces that Little Whale continues to mirror. A plugin that depends on a component deliberately replaced or removed by Little Whale may require adaptation. Compatibility is verified against pinned upstream snapshots; it is not an unconditional promise across arbitrary future versions of either project.

## Update model

Little Whale does not follow upstream by reviewing or cherry-picking every commit. It tracks pinned package snapshots with explicit ownership modes:

- `upstream-mirror`: retained unchanged and replaceable from the pinned source.
- `little-whale`: owned by this project and never overwritten by synchronisation.
- `adapted-upstream`: upstream-derived code with a documented Little Whale adaptation.
- `excluded`: deliberately absent from the product.

The machine-readable boundary lives in [`upstream/manifest.yml`](upstream/manifest.yml). The current source revision and package hashes live in [`upstream/lock.yml`](upstream/lock.yml). Operational details are documented in [`upstream/README.md`](upstream/README.md).

## Sources and licensing

Canonical upstream source: `https://github.com/deepseek-ai/deepseek-harness.git`

Initial Little Whale source line: `https://github.com/ddonofrio/deepseek-harness.git`

DeepSeek Harness components retain their MIT licence and notices. Little Whale-owned code is GPL-3.0-or-later. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the complete attribution record.
