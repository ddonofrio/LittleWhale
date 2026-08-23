# Little Whale documentation

This repository contains two related kinds of documentation:

1. **Little Whale product documentation**, maintained for users and contributors of this fork.
2. **Inherited technical reference**, retained from DeepSeek Harness because Little Whale deliberately preserves much of its runtime, plugin system, and package architecture.

The distinction is intentional. An inherited document may use internal names such as `dsh`, `DSH_*`, or `@deepseek-ai/*`; these are compatibility identifiers, not Little Whale product branding.

## Start here

| Audience | Recommended entry point |
|---|---|
| New user | [Project overview and quick start](../README.md) |
| Local-model user | [Local provider configuration](../website/providers.md) |
| Plugin or extension author | [Architecture overview](architecture.md) and [extension cookbook](cookbook/extension-cookbook.md) |
| Contributor | [Development guide](development.md) and [contribution policy](../CONTRIBUTING.md) |
| Maintainer | [Upstream relationship](../UPSTREAM.md) and [synchronisation boundary](../upstream/README.md) |
| Licence reviewer | [Third-party notices](../THIRD_PARTY_NOTICES.md) |

## Documentation layers

### Product documentation

These documents describe Little Whale as a product and must use Little Whale terminology:

- The root [README](../README.md).
- The concise website pages under [`website/`](../website/).
- [Local-provider documentation](../website/providers.md).
- [Brand guidelines](../BRAND_GUIDELINES.md).
- [Contribution policy](../CONTRIBUTING.md).
- [Upstream relationship and compatibility](../UPSTREAM.md).

### Architecture and contributor reference

The documents under `docs/` explain the retained runtime, Cordis composition, extension seams, agent lifecycle, tools, sessions, and contributor workflow. Much of this material originated in DeepSeek Harness and remains valid because Little Whale uses the same architecture.

Do not mechanically replace internal API names in these documents. Update them only when Little Whale changes the corresponding behaviour or contract.

### Package documentation

README files under `packages/`, `apps/`, `python/`, and `vendor/` document individual implementation packages. Packages classified as upstream mirrors intentionally retain their original names and MIT provenance. Their README files are technical contracts, not product landing pages.

## Naming rules

- **Little Whale** refers to this product and repository.
- **DeepSeek Harness** refers to the upstream project.
- **`dsh`**, **`DSH_*`**, and **`@deepseek-ai/*`** may remain when they name inherited commands, environment variables, package scopes, configuration keys, or public compatibility contracts.
- A factual upstream reference must not imply that Little Whale is an official DeepSeek product.

## Documentation standards

- Write all maintained documentation in English.
- Keep user-facing documentation concise and task-oriented.
- Keep architectural documentation precise and close to the source contract.
- Link to the canonical document instead of duplicating explanations.
- Update documentation and tests with every behavioural change.
- Preserve upstream attribution and licence notices.
- Do not add translated copies or bilingual pairing metadata.
