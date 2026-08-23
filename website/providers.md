# Local providers

Little Whale is designed around locally hosted models. A local provider is the primary setup path, not an advanced fallback.

## Default endpoint

The default web composition uses the generic `llm-pi-ai` adapter and starts with this editable OpenAI-compatible endpoint:

```text
http://127.0.0.1:1234/v1
```

This is suitable for local inference applications such as LM Studio or any other server exposing a compatible API. The endpoint may also point to a model server elsewhere on the local network.

## Model discovery

Little Whale requests the server's model list and uses the response to populate model selection. If several models are available, the suggested model can be changed before the configuration is saved.

## Authentication

An API key is optional. When a local or LAN server requires authentication, credentials are handled through the existing credential abstraction and are not written into repository files.

## Connection requirements

The configured server must provide an OpenAI-compatible API at the selected base URL. Confirm that the local server is running, that its API is enabled, and that the address is reachable from the machine running Little Whale.

Little Whale does not require or configure an official DeepSeek cloud account. A locally hosted model may still belong to the DeepSeek model family; model identity and provider location are separate concerns.
