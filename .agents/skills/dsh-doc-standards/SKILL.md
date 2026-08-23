---
name: dsh-doc-standards
description: 'Use when writing, moving, reviewing, or auditing documentation in the Little Whale repository — choosing hierarchy and detail, separating tutorials from references, checking tutorial progression, trimming doc slop, or responding to a verify-doc-budgets failure.'
---

# Applying the Little Whale Documentation Standard

The documentation rules live in [docs/AGENTS.md](../../../docs/AGENTS.md). Use this workflow for placement, corpus audits, budgets, and validation across Markdown, JSDoc, and code comments. Use [dsh-prose-standard](../dsh-prose-standard/SKILL.md) for required coverage and editorial judgment.

## Sources of truth

- [docs/AGENTS.md](../../../docs/AGENTS.md) — hierarchy, tutorial/reference forms, taxonomy, budgets, and the slop checklist.
- [.agents/notes/README.md](../../notes/README.md) — when a decision earns an Agent Note and what it contains.
- [docs/postmortem/README.md](../../../docs/postmortem/README.md) — when an incident earns a postmortem.
- Root [AGENTS.md](../../../AGENTS.md) — standing repository orders.
- [Archived Agent Notes](../../notes/archived/AGENTS.md) — frozen historical snapshots excluded from editorial maintenance.

Documentation is canonical and English-only. Do not create language-suffixed Markdown files, localization sidecars, language switchers, translated counterparts, or translation automation. Keep Unicode-capable rendering and user/model content tests when they test runtime behavior rather than documentation policy.

## Review structure before prose

Apply the standard's authoring order to every human-facing document in scope. Do not apply this structural pass to Agent Notes. Classify a postmortem as a reference scoped to one incident; preserve its chronological evidence.

1. Locate the document in the repository and navigation trees. State its subject and identify its direct children.
2. Set the permitted level of detail. Keep full detail about the subject, summarize direct children by purpose and high-level behavior, and link to their owning documents.
3. Classify the document from its intended use. A tutorial leads through ordered work to an observable outcome; a reference supports lookup within an explicit scope.
4. For a tutorial, establish prerequisites before dependent concepts and move optional advanced detail to a later tutorial or reference.
5. Split substantial mixed forms. Put a small secondary form in a clearly labeled section.

Before renaming or moving a document, grep for inbound references. `verify-md-links` catches Markdown targets and fragments; `verify-doc-refs` catches `docs/*.md` citations in TypeScript comments. A move is atomic: remove the old home, add the new home, and fix every inbound link in the same change.

## Audit the corpus

Exclude `vendor/` and `.agents/notes/archived/` from corpus audits and edits. Archived Agent Notes are frozen snapshots; inspect an exact target only to understand a historical inbound citation.

1. Measure with `pnpm run verify-doc-budgets --list` and a Markdown word-count scan.
2. Hunt reasoning-transcript leakage with [dsh-trim-cot-leakage](../dsh-trim-cot-leakage/SKILL.md).
3. Hunt duplication by grepping distinctive phrases. Keep one home and link other copies.
4. Replace hand-written catalogs, inventories, and JSDoc restatements with their authoritative source or generator.
5. Keep implemented Agent Notes in present tense with durable rationale and verification evidence.

Keep every load-bearing rule, preferably as one to three lines plus a link to its rationale. Cut stories, duplicates, status notes, and the path used to derive the rule.

## Validation

Run at least `pnpm run doc-sync`, `pnpm run lint`, and `git diff --check`; JSDoc changes may regenerate catalogs. Report the inspected scope, deliberate keeps, deferred cases, and the exact checks run.
