---
name: dsh-doc-site-sync
description: Use when publishing, updating, moving, or removing Little Whale documentation website pages; editing website/docs.ts mappings or navigation; diagnosing a missing projected page; or running the docs:check and doc-sync workflow after website changes.
---

# Synchronizing the Little Whale Documentation Site

Keep repository Markdown as the only editable content source. The website is a tested English-only projection: [website/docs.ts](../../../website/docs.ts) selects public pages, [scripts/project-doc-site.ts](../../../scripts/project-doc-site.ts) rewrites them into disposable `website/.generated/`, and VitePress builds that tree. The build also emits raw Markdown twins and `llms.txt` from the same manifest.

## Read the owning contracts

- Read [docs/AGENTS.md](../../../docs/AGENTS.md) and use [dsh-doc-standards](../dsh-doc-standards/SKILL.md) for placement and prose.
- Read the current `DocsPage` type and entries in [website/docs.ts](../../../website/docs.ts) before changing the manifest.
- Read [website/.vitepress/config.ts](../../../website/.vitepress/config.ts) before adding a section or navigation item.

## Classify the change

- Edit an already published page by changing its canonical Markdown source.
- Publish a new page in its owning `docs/` tier, then add one English manifest entry.
- Rename, move, or remove a page by updating the canonical file, manifest entry, and inbound links atomically.
- Publish generated catalogs by changing their generator or source metadata, not the generated file.

Never edit or commit `website/.generated/`, `website/.cache/`, or `website/.dist/`. Except for `website/AGENTS.md`, do not add Markdown under `website/`; keep canonical content under `docs/`. Do not publish `AGENTS.md`, postmortems, testing guides, or maintainer workflows unless the user explicitly expands the public scope.

## Add or update a manifest entry

Set every `DocsPage` field deliberately:

- `source`: repository-relative canonical English Markdown path.
- `route`: public VitePress path including the `.md` suffix.
- `label`: sidebar label, not necessarily the document H1.
- `sidebar`: `guide`, `develop`, `reference`, or `null` for the home page.
- `section`: an existing section when possible; add new placement in the site configuration when needed.
- `order`: stable order within the section.
- `sourceAliases`: optional repository paths resolving to the same page.

Keep the manifest an explicit public allowlist. Do not publish internal material merely because it exists under `docs/`.

## Preserve link behavior

Write repository-relative Markdown links in canonical docs. The projector maps manifest targets to site routes, maps other existing targets to GitHub, copies local images inside the repository, preserves external and fragment-only links, and fails on missing repository-relative targets. Do not write website-specific routes into canonical Markdown; use `sourceAliases` for directory-style repository links.

## Validate

Run `pnpm docs:check`, then `pnpm run doc-sync`, `pnpm run lint`, and `git diff --check`. Do not start a preview server unless the user explicitly requests it; report the canonical files changed, routes affected, and exact checks run.

## Keep deployment separate

Synchronizing content into the VitePress build does not publish it to the internet. Do not add deployment workflows, hosting permissions, custom domains, or public hosting without an explicit request.
