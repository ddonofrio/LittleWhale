---
name: dsh-prose-standard
description: Use when writing, reviewing, restoring, trimming, or auditing prose in the Little Whale repository, including Markdown, JSDoc, comments, prompts, descriptions, diagnostics, and UI strings.
---

# Little Whale Prose Standard

Write enough to preserve the contract, then remove reasoning transcripts, repetition, and decoration. A contract is an obligation, invariant, precondition, postcondition, or compatibility promise that a caller, implementer, producer, or consumer relies on. Use [dsh-doc-standards](../dsh-doc-standards/SKILL.md) for placement and budgets and [dsh-trim-cot-leakage](../dsh-trim-cot-leakage/SKILL.md) for reasoning-transcript leakage.

## Inputs and exclusions

Require an explicit `scope`. If it is missing, report the required input and stop; do not infer a repository-wide scope. Accept `mode: automatic | interactive`; default to `automatic`. Review and audit tasks report findings without editing; explicitly requested write, fix, or trim tasks may edit.

Always exclude `vendor/` from discovery, review, and edits. Treat generated catalogs, snapshots, and fixtures as derivative: edit their owner or scenario first, then regenerate.

Canonical repository prose is English-only. Do not add translated counterparts, locale switchers, or translation sidecars. User and model content is data, not product copy; preserve its Unicode behavior and tests.

## Preserve the complete proposition

Before editing, identify every proposition. Preserve the actor and action, condition, timing, ordering, modality, negative guarantee, exception, ownership, side effect, failure mode, and consequence. Remove adjectives, repetition, and narration only when every factual clause survives.

Keep a complete local contract at the point of use. Link to the owning document for architecture, rationale, algorithms, history, or extended examples. Keep non-obvious rationale when omitting it could cause misuse.

## Required coverage

- Public JSDoc documents caller-visible return distinctions, throws or rejections, side effects, ownership, timing, cancellation, and durability.
- Internal comments orient non-local structure, invariants, race ordering, ownership, security boundaries, and surprising failure behavior.
- Tests explain only non-obvious fixture or assertion design.
- Cookbooks include prerequisites, required actions, the real entry path, observable verification, and concise warnings.
- READMEs include configuration, semantics, failures, limitations, extension points, and model-visible effects.
- Skills and agent instructions state behavioral guardrails and explicit scope limitations.
- Prompts and visible strings are behavior; inspect generated output and run behavior validation.
- Diagnostics name the failing subject, violated rule, and correction when non-obvious.

## Workflow

1. Confirm the scope, mode, current branch, and applicable `AGENTS.md` files.
2. Read the documentation standard and the owning code or document before judging prose.
3. Inspect the requested scope, then classify each candidate as keep, add, trim, restore, restructure, or defer.
4. Update the owner before derivative artifacts and re-check analogous passages.
5. Run narrow relevant checks, documentation gates, `git diff --check`, and behavior tests for visible strings.
6. Report the inspected scope, changes, deliberate keeps, deferred cases, and checks actually run.
