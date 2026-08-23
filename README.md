# Little Whale

Little Whale is a local-model-first agentic coding assistant.

## Status

This repository is an active bootstrap and integration build. The web product is usable for development, but interfaces and composition details may change.

## Quick start

Requirements: Node.js 22.19+ (or Node.js 24+) and pnpm 11.7+.

```sh
pnpm install
pnpm dev:web
```

On first launch, configure an OpenAI-compatible server at:

```text
http://127.0.0.1:1234/v1
```

The endpoint is editable, so a model server on another LAN address can be used. Little Whale discovers models from the server's model-list endpoint; an API key is optional and is stored through the credential abstraction.

## Development commands

```sh
pnpm typecheck
pnpm lint
pnpm test:upstream
pnpm upstream:verify
pnpm build:web
pnpm docs:build
```

## Architecture and ownership

Generic upstream packages remain replaceable MIT components. Little Whale owns the final branding plugin, web composition overlay, English-only locale policy, documentation, provenance files, and synchronization tooling. Bootstrap behaviour changes that could not be extracted are listed as `adapted-upstream` in `upstream/manifest.yml`.

## Privacy defaults

Little Whale does not select a cloud model, contact an official DeepSeek service, enable DeepSeek web search, or send telemetry during startup. Network requests begin only after a configured local or LAN provider is used.

## Upstream and licensing

Use package-snapshot updates rather than commit cherry-picks:

```sh
pnpm upstream:plan --ref <commit-or-tag>
pnpm upstream:sync --ref <immutable-sha> --allow-dirty
pnpm upstream:verify
```

Little Whale product code is GPL-3.0-or-later. Upstream attribution and its MIT license are recorded in `THIRD_PARTY_NOTICES.md` and `upstream/`; Little Whale is not an official DeepSeek product.
