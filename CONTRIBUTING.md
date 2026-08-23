# Contributing to Little Whale

Little Whale is an agentic coding assistant focused on small, locally hosted language models. Useful contributions are those that improve local-provider compatibility, efficiency, reliability, documentation, testing, or interoperability with the DeepSeek Harness plugin ecosystem.

## Current contribution model

The project is in an early, tightly coordinated stage and is not currently accepting unsolicited external code contributions. This keeps architectural and compatibility decisions coherent while the core product boundaries are still changing.

You can still make a meaningful contribution:

- Report reproducible bugs.
- Propose improvements and describe the local model or inference server involved.
- Share compatibility results for DeepSeek Harness plugins and extensions.

## Development handoff

Changes use the two-phase workflow in the [development guide](docs/development.md#development-handoff): implementation first reaches a TypeScript-and-build validation handoff, then the contributor validates the visual and functional behavior before final tests, coverage, documentation gates, and commit work begin.
- Publish independent plugins using the retained Cordis extension model.
- Improve examples, guides, or troubleshooting information through an issue or discussion.
- Help other users reproduce and diagnose local-model behaviour.

## Reporting a problem

Include:

- Little Whale revision or version.
- Operating system and Node.js version.
- Local inference server and version.
- Model name, quantisation, and context configuration when relevant.
- Exact reproduction steps.
- Expected and observed behaviour.
- Sanitised logs with credentials, tokens, local paths, and private source removed.

## Plugin compatibility

When reporting a DeepSeek Harness plugin compatibility problem, identify the plugin version, the upstream interface it expects, and whether the affected package is mirrored, adapted, or replaced by Little Whale. See [`UPSTREAM.md`](UPSTREAM.md) for the compatibility policy.

## Documentation and language

All project documentation, source comments, test descriptions, configuration help, and agent instructions are written in English. User and model content remains fully Unicode-capable.

## Security and credentials

Never include API keys, authorization headers, private repository content, or sensitive prompts in issues, logs, examples, or screenshots.
