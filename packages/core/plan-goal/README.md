# @ddonofrio/littlewhale-plan-goal

The plan-goal core module turns every direct user request into a durable goal before the request reaches the current agent.

For every request, the module makes a separate `ctx.llm.stream()` call with the clean, user-visible conversation transcript used by `completion_check` plus the newly claimed request. The planner has one synthetic `emit_goal` result tool and must call it exactly once with `goal` and `source_excerpt`; it cannot return free-form text. The result is validated locally: `goal` must be one user story, `source_excerpt` must be an exact substring of the latest request, and prompt-wrapper text is rejected. The validated `goal` is persisted through `ctx.goals`, using the same create/edit domain operations as `/goal`.

The planner is skipped for nested agents, plugin messages, and disabled configurations. Enabled direct requests are published to the session immediately, so the user message is visible while the auxiliary planner is running; the parent model request is admitted only after the planner returns one valid `emit_goal` call. A malformed structured result is sent back to the same planner as validator feedback and retried up to ten times after the initial attempt; the validation diagnostic stays inside the auxiliary exchange. If the route or auxiliary call is unavailable, fails, times out, reaches the model output limit, or all eleven attempts remain invalid, the turn fails with a generic resolution error and the parent request is not sent.

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

The main agent does not see the planner tool. Before the parent step is admitted, the auxiliary call receives only the synthetic `emit_goal` result tool and uses `purpose: 'goal'`. It inherits the selected model's maximum output budget and reasoning policy. The original user message is published unchanged as soon as planning begins, so it can be displayed while the planner runs. Its tool arguments are validated before a separate plugin-sourced notice is appended: `SYSTEM: Just created the goal: <goal>` followed by `PLEASE STICK TO YOUR GOAL.` Non-text content such as images remains attached to the original request. The goal domain and its existing continuation driver are updated with the same validated text. The parent request is never started without that result.

#### Token effect

The planner sends the clean transcript and newly claimed request once in its auxiliary call. Its input and output tokens are charged to that call; the normalized goal text is then retained as one ordinary user-role message in the parent session.

#### KV Cache effect

The planner is a separate request and does not extend the parent's cached context. Only the durable goal change and the ordinary parent request affect later parent assembly.

## Known Limitations and Deferred Work

- Goal derivation is model-assisted and is not a correctness guarantee; an unresolved goal blocks the turn rather than silently changing the objective.
- The clean transcript intentionally omits runtime context and successful raw tool results, matching the completion-checker projection.
