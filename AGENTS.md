# Little Whale repository rules

Little Whale is an English-only, local-model-first agentic development product. All code, comments, documentation, tests, configuration descriptions, and agent instructions owned by this project are written in English. User and model content remains fully Unicode-capable, including CJK content.

## General principles

- Keep implementations simple, explicit, maintainable, and easy to review.
- Prefer minimal, focused changes over broad refactors.
- Preserve existing architecture and behavior unless the task explicitly requires changing them.
- Reuse existing utilities, abstractions, components, and patterns before creating new ones.
- Avoid speculative features, unnecessary abstractions, and unrelated cleanup.
- Write all project-owned code, comments, documentation comments, docstrings, diagnostics, prompts, and user-visible strings in English, regardless of the language used by the user or in user-provided literals. Preserve Unicode in user and model content.

## Before modifying code

- Identify existing patterns, tests, configuration, and dependencies that affect the task.
- Check for repository-specific instructions before editing files.
- Do not assume how something works when it can be verified from the codebase.

## Implementation

- Make the smallest change that fully satisfies the requirement.
- Follow the existing coding style and naming conventions.
- Keep functions and modules focused on a single responsibility.
- Handle errors explicitly.
- Preserve backward compatibility unless explicitly instructed otherwise.
- Avoid duplicating logic.
- Do not leave dead code, temporary hacks, debug output, or commented-out implementations or files.

`upstream-mirror` packages are read-only and replaceable from the pinned canonical snapshot. Product changes belong in Little Whale packages, plugins, composition overlays, or tests. Changes to `adapted-upstream` packages must update the ownership manifest and provenance notes.

The effective product must not activate a DeepSeek cloud provider, DeepSeek telemetry, DeepSeek web search, or official DeepSeek onboarding. Do not add secrets or API keys to source files, tests, logs, or snapshots.

Behavioural changes require focused tests and documentation before finalization. For every user-visible UI change, make the code change, build the smallest relevant component or application artifact needed for the user to inspect the change, explicitly ask the user to validate the changed UI visually, and stop. Do not inspect the UI visually or run browser, GUI, snapshot, or other visual checks on the user's behalf. Wait for the user's explicit confirmation that the visual result is OK before running unit tests, TypeScript checks beyond the prerequisite build, documentation validation, coverage, or any other remaining checks. If the user requests another change during visual validation, update the implementation, rebuild the relevant artifact, and pause again; do not run the deferred checks until the visual result has been approved. Follow the [development handoff](docs/development.md#development-handoff) contract. Use `pnpm upstream:plan`, `pnpm upstream:sync`, and `pnpm upstream:verify` for upstream updates; never cherry-pick upstream commits.

Mirrored packages retain their upstream MIT metadata. New Little Whale files and packages are GPL-3.0-or-later. Adapted packages retain upstream notices and must document the adaptation boundary.
