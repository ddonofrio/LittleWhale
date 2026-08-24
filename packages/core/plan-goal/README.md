# @ddonofrio/littlewhale-plan-goal

The plan-goal core module turns every direct user request into a durable goal before the request reaches the current agent and validates active goals before a completed response closes its turn.

For every request, the module makes a separate `ctx.llm.stream()` call with the clean, user-visible conversation transcript used by `completion_check` plus the newly claimed request. The planner has one synthetic `emit_goal` result tool and must call it exactly once with `goal` and `source_excerpt`; it cannot return free-form text. The result is validated locally: `goal` must be one user story, `source_excerpt` must be an exact substring of the latest request, and prompt-wrapper text is rejected. The validated `goal` is persisted through `ctx.goals`, using the same create/edit domain operations as `/goal`.

When an armed goal's agent turn reaches a normal completion, the module makes a mandatory second `ctx.llm.stream()` call over the same clean conversation and the active objective. This validator has no tools, uses `purpose: 'goal'`, the configured timeout, and the same eleven-attempt bound as goal planning. It must return `STATUS: DONE|UNCOMPLETE|UNKNOWN` and `REASON: <text>`. `DONE` completes the goal and adds the reason as a visible notice. `UNCOMPLETE` and `UNKNOWN` keep the goal active and steer `Questioning agent: <reason>` into the next agent step. Malformed validator output is retried with local format feedback; transport, timeout, and exhaustion failures become `UNKNOWN` so the agent must continue rather than silently closing the goal.

The host rejects autonomous `update_goal` calls with `complete` or `blocked`, so the model cannot bypass validation or trigger the former terminal wrap-up context. Direct-human goal mutations remain available.

The planner is skipped for nested agents, plugin messages, and disabled configurations. Enabled direct requests are published to the session immediately, so the user message is visible while the auxiliary planner is running; the parent model request is admitted only after the planner returns one valid `emit_goal` call. Duplicate pre-step delivery of the same claimed request shares one in-flight planner call. A malformed structured result is sent back to the same planner as validator feedback and retried up to ten times after the initial attempt; the validation diagnostic stays inside the auxiliary exchange. If the route or auxiliary call is unavailable, fails, times out, reaches the model output limit, or all eleven attempts remain invalid, the turn fails and the parent request is not sent. Planner timeouts retain the `PLAN_GOAL_TIMEOUT` error code.

## Configuration

```yaml
- id: plan-goal
  name: '@ddonofrio/littlewhale-plan-goal'
  config:
    enabled: true
    timeoutMs: 60000
```

The `enabled` value is also exposed as the `plan-goal` General setting. It defaults to `true` and applies live to direct user requests. The timeout applies to both the planner and the mandatory active-goal validator.

## Model Experience

### Goal planning request

#### What the model sees

The main agent does not see the planner tool. Before the parent step is admitted, the auxiliary call receives only the synthetic `emit_goal` result tool and uses `purpose: 'goal'`. It inherits the selected model's maximum output budget and reasoning policy. The original user message is published unchanged as soon as planning begins, so it can be displayed while the planner runs. Its tool arguments are validated before a separate plugin-sourced notice is appended: `SYSTEM: Just created the goal: <goal>` followed by `PLEASE STICK TO YOUR GOAL.` Non-text content such as images remains attached to the original request. The goal domain and its existing continuation driver are updated with the same validated text. The parent request is never started without that result.

#### Token effect

The planner sends the clean transcript and newly claimed request once in its auxiliary call. Its input and output tokens are charged to that call; the normalized goal text is then retained as one ordinary user-role message in the parent session.

#### KV Cache effect

The planner is a separate request and does not extend the parent's cached context. Only the durable goal change and the ordinary parent request affect later parent assembly.

### Goal validation

#### What the model sees

After the agent has produced a normal response, the user sees `Validating response…` while the auxiliary validator reads the clean transcript. The validator receives no tools and cannot modify the workspace. A completed goal adds `Goal completed: <reason>` to the conversation; an unfinished or indeterminate goal sends `Questioning agent: <reason>` to the agent and displays that same message before the follow-up response.

#### Token effect

Each completed response with an armed goal adds one validator request, plus any local format retries. A validation result does not extend the parent model's cached context; only its visible notices and any follow-up agent step do so.

#### KV Cache effect

The validator is a separate request and does not extend the parent's cached context. Only the visible notices and any follow-up agent step affect later parent assembly.

## Known Limitations and Deferred Work

- Goal derivation and validation are model-assisted and are not correctness guarantees; validation fails closed by keeping the goal active and requesting more work.
- The clean transcript intentionally omits runtime context and successful raw tool results, matching the completion-checker projection.
