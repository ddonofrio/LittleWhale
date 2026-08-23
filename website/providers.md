# Local providers

The default web composition uses the generic `llm-pi-ai` adapter with an
OpenAI-compatible endpoint at `http://127.0.0.1:1234/v1`.

The endpoint remains editable for LAN-hosted servers. Model discovery reads the
server's model list, and an API key is optional. Credentials are handled by the
existing credential abstraction and are never written into repository files.
