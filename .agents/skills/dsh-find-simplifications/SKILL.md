---
name: dsh-find-simplifications
description: Use when working in the Little Whale repo to find non-obvious simplification candidates, add focused inline TODO/FIXME/XXX notes, or assess worthwhile simplification ideas from another PR; especially for dead, duplicated, speculative, over-built, added-then-removed, or hand-rolled-where-a-dependency-exists surfaces.
---

# Finding Little Whale Simplifications

Turn broad simplification requests into evidence-backed candidates that remove or collapse existing product surface. Follow the code, keep judgment active, and prefer a few well-proven candidates over a pile of thin guesses.

## Start With Repository Context

- Read `AGENTS.md`, [docs/defensive-patterns.md](../../../docs/defensive-patterns.md), [docs/testing.md](../../../docs/testing.md), and [docs/architecture.md](../../../docs/architecture.md) before judging package topology or test coverage.
- Treat dual LLM adapters and dual persistence backends as intentional by default. Do not propose deleting either twin or backend unless the user explicitly overrides that constraint.

## What Counts As A Strong Candidate

A strong simplification removes, folds, or demotes something real and has clear evidence that the current design costs more than it buys:

- A public method, event, config knob, registry notification, helper, package, durable event, or test artifact has no production consumer.
- Tests or documentation are the only consumers, and the behavior they pin is not load-bearing.
- Two representations mirror the same fact, especially across durable session events and transient `agent/*` events.
- A seam exposes methods every implementation must support but no consumer uses.
- A package exists only for test, demo, or support code and adds publish or dependency overhead.
- A feature implements speculative product generality with no product owner.
- An invariant, rollback path, expected-output set, or special-case test protects an unused API.
- Hand-rolled code duplicates a maintained dependency or a Node builtin available at the repository engine floor.

Thin candidates are not enough: deleting a typo, running `knip` once, removing an intentionally documented backend, or calling something complex without call-site proof does not justify a proposal.

## Survey Broadly

When the user asks for breadth, cover the agent loop and session log, ACP and UI APIs, LLM/tools/system prompt, execution and jobs, and packages/examples/scripts/tests. If subagents are unavailable, cover the same domains yourself. Do not stop at the first good candidate.

Start with the largest production-code deltas. An audit that stops after obvious unused symbols can miss duplicated lifecycle or defensive machinery.

## Prove Or Reject Each Candidate

Use `rg` first for exact symbols, events, package names, configuration keys, method calls, and wire strings. Then read the call sites. `knip` can help, but it does not replace understanding public interfaces, dynamic registrations, tests, documentation, and loader paths.

Classify consumers before deciding:

- Production corpus: `packages/*/src`, `examples/*/src`, `examples/**/*.yml`, runtime scripts, and loader/configuration paths.
- Non-production corpus: tests, READMEs, documentation, snapshots, generated expected outputs, and comments.
- Ambiguous corpus: examples and scripts that may be product smoke paths; inspect usage before classifying.

Reject or downgrade a candidate when a production caller exists, the removal would force unrelated churn without reducing required behavior, or the idea is too small. For a small, clearly useful cleanup, add a focused inline TODO/FIXME/XXX using the urgency semantics in [docs/development.md](../../../docs/development.md).

## Inline TODO Notes

Use inline TODO/FIXME/XXX only for small, local cleanups that are clearly useful. Keep them short and actionable:

- Name the smell with a stable tag, for example `TODO(double-default)` or `XXX(unused-default)`.
- Explain why it is safe to revisit and what action would simplify it.
- Do not add TODOs for speculative complaints or behavior that needs a product decision.

## When Folding Another PR Or Branch

Diff the sibling branch against `origin/master`, not against the current PR branch, so the independent contribution is visible. Port non-overlapping TODOs that meet the quality bar, avoid duplicates, and update the PR body with the real candidate count and scope.

## Validation And Reporting

For documentation-only work, run the relevant documentation checks, lint, and `git diff --check`. For code comments or skill changes, run the relevant validator when one exists. Select any additional evidence from the outgoing diff; the pre-push hook contributes typecheck.

Report the areas surveyed, the evidence behind each candidate, what was intentionally excluded, and which checks passed.
