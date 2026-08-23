# @ddonofrio/littlewhale-plan-goal

The plan-goal core module turns every direct user request received while plan mode is active into a durable goal before the request reaches the current agent.

For every request, the module starts a fresh one-shot subagent with the clean, user-visible conversation transcript used by `completion_check` plus the newly claimed request. The prompt requires a goal even for greetings or other requests that only need a reply, and asks the planner to fix spelling, improve clarity, and make the wording concise without changing intent. The subagent must call the provider's child-scoped `structured_output` tool with one concise paragraph in `goal`. The returned objective is persisted through `ctx.goals`, using the same create/edit domain operations as `/goal`.

The planner is skipped for inactive plan mode, nested agents, plugin messages, and disabled configurations. If the configured provider is unavailable or cannot produce structured output, the current user request is used as a fail-open fallback and the parent request still proceeds.

## Configuration

```yaml
- id: plan-goal
  name: '@ddonofrio/littlewhale-plan-goal'
  config:
    enabled: true
    provider: spawn
```

## Model Experience

The main agent does not see a planner tool. It receives the ordinary user request, while the goal domain and its existing continuation driver are updated before the step is admitted. The planner is a separate child request and its `structured_output` call is the authoritative goal capture.

#### KV cache effect

The planner is a separate request and does not extend the parent's cached context. Only the durable goal change and the ordinary parent request affect later parent assembly.

## Known Limitations and Deferred Work

- Goal derivation is model-assisted and is not a correctness guarantee; the user request remains the fallback objective when planning fails.
- The clean transcript intentionally omits runtime context and successful raw tool results, matching the completion-checker projection.
