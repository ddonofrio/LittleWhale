# Atlassian Rovo MCP PoC

This opt-in overlay connects Little Whale to the official Atlassian Rovo MCP Server. It exposes Rovo's discovered Jira and Confluence tools to the model through the generic MCP bridge as `mcp__atlassian_rovo__<tool>`.

The overlay uses the generally available Rovo MCP endpoint and reads the authorization header from a local `credentials.json` file. The real file is ignored by Git, while `credentials.example.json` is safe to copy. It does not perform OAuth or enable the overlay by default.

## Prerequisites

- An Atlassian Cloud account with access to the required Jira and Confluence content.
- Atlassian Rovo MCP enabled for the organization.
- A personal API token or service-account API key accepted by the Rovo MCP Server.
- The token must have the read and search permissions needed for the intended PoC.

Atlassian documents personal tokens as Basic auth using the Base64 encoding of `email:api_token`, and service-account keys as Bearer auth. API-token authentication must be enabled by an organization administrator. See the [Atlassian API-token authentication guide](https://developer.atlassian.com/cloud/rovo-mcp/guides/configuring-authentication-via-api-token/).

## Configure the credential JSON

Copy the example file:

```powershell
Copy-Item examples/mcp-atlassian-rovo/credentials.example.json examples/mcp-atlassian-rovo/credentials.json
```

For a personal API token, replace the placeholder with the Base64 encoding of `email:api_token`:

```json
{
  "authorization": "Basic BASE64_ENCODED_EMAIL_AND_API_TOKEN"
}
```

For a service-account API key, use:

```json
{
  "authorization": "Bearer YOUR_SERVICE_ACCOUNT_API_KEY"
}
```

Keep the real file local or in a secret-managed workspace. Do not commit its values or copy them into `rovo.cordis.yml`, source files, tests, logs, or snapshots.

## Run

From the Little Whale repository root:

```sh
pnpm dsh web --patch examples/mcp-atlassian-rovo/rovo.cordis.yml
```

Wait for the MCP tools to be discovered before sending the first prompt. A useful validation prompt is:

```text
Search Confluence for documentation about the LTM240 and the orange LED 3. Fetch the most relevant pages, compare any conflicting descriptions, and answer in Spanish with links to the source pages. Do not use general web search.
```

The expected model-facing tool names begin with `mcp__atlassian_rovo__`. If startup fails, check the authorization header, token scopes, organization policy, and access to the Atlassian site.

## Scope

This is intentionally a small proof of concept. It uses a local static credential file, so the current Little Whale path is best suited to one local operator or a service account. OAuth 2.1 can be added later for per-user interactive access; Atlassian recommends OAuth for user-driven scenarios.
