# @ddonofrio/littlewhale-plan-goal

The plan-goal core module turns every direct user request into a durable goal before the request reaches the current agent.

For every request, the module makes a separate tools-free `ctx.llm.stream()` call with the clean, user-visible conversation transcript used by `completion_check` plus the newly claimed request. The system prompt explicitly forbids execution, investigation, workspace access, and tool calls. It requires one concise plain-text paragraph describing the main agent’s intended response or action rather than copying a short or conversational request, including for greetings or other requests that only need a reply. The returned text is persisted through `ctx.goals`, using the same create/edit domain operations as `/goal`.

The planner is skipped for nested agents, plugin messages, and disabled configurations. For enabled direct requests, the parent request is admitted only after the planner returns a valid goal. If the route or auxiliary call is unavailable, fails, times out, returns no text, reaches the model output limit, or emits a tool call, the turn fails and the parent request is not sent.

## Configuration

```yaml
- id: plan-goal
  name: '@ddonofrio/littlewhale-plan-goal'
  config:
    enabled: true
    timeoutMs: 60000
```

The `enabled` value is also exposed as the `plan-goal` General setting. It defaults to `true` and applies live to direct user requests.

## Model Experience

### Goal planning request

#### What the model sees

The main agent does not see a planner tool. Before the step is admitted, the auxiliary call receives no tools and uses `purpose: 'goal'`. It inherits the selected model's maximum output budget and reasoning policy, so it can reason before returning one concise goal. Its text-only result is normalized and becomes the text of the latest user message, with the user source preserved; non-text content such as images remains attached. The goal domain and its existing continuation driver are updated with the same text. The parent request is never started without that result.

#### Token effect

The planner sends the clean transcript and newly claimed request once in its auxiliary call. Its input and output tokens are charged to that call; the normalized goal text is then retained as one ordinary user-role message in the parent session.

#### KV Cache effect

The planner is a separate request and does not extend the parent's cached context. Only the durable goal change and the ordinary parent request affect later parent assembly.

## Known Limitations and Deferred Work

- Goal derivation is model-assisted and is not a correctness guarantee; an unresolved goal blocks the turn rather than silently changing the objective.
- The clean transcript intentionally omits runtime context and successful raw tool results, matching the completion-checker projection.
