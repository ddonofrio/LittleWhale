# @ddonofrio/littlewhale-plan-goal

The plan-goal core module turns every direct user request into a durable goal before the request reaches the current agent and validates active goals before a completed response closes its turn.

For every request, the module makes a separate `ctx.llm.stream()` call with the clean, user-visible conversation transcript used by `completion_check` plus the newly claimed request. The planner has one synthetic `emit_goal` result tool and must call it exactly once with `goal` and `source_excerpt`; it cannot return free-form text. The result is validated locally: `goal` must be one user story, `source_excerpt` must be an exact substring of the latest request, and prompt-wrapper text is rejected. The validated `goal` is persisted through `ctx.goals`, using the same create/edit domain operations as `/goal`. If a response is rejected, retries continue the same auxiliary chat with a compact local correction as the final message, an explicit attempt number, and temperature `0`; malformed model output is not replayed into the next request, so the model does not reinforce its invalid format.

When an armed goal's agent turn reaches a normal completion, the module makes a mandatory second `ctx.llm.stream()` call over the same clean conversation and the active objective. This validator has no tools, uses `purpose: 'goal'`, the configured timeout per attempt, and the same ten-attempt bound as goal planning. It must return `STATUS: DONE|UNCOMPLETE|UNKNOWN` and `REASON: <text>`. `DONE` completes the goal and adds the reason as a visible notice. `UNCOMPLETE` and `UNKNOWN` keep the goal active and steer `Questioning agent: <reason>` into the next agent step. Malformed validator output is retried in the same auxiliary chat with local format feedback; every retry gets a fresh full timeout. Transport, timeout, and exhaustion failures become `UNKNOWN` so the agent must continue rather than silently closing the goal.

If the active goal is paused or deleted while validation is running, the host aborts the in-flight LLM call and records a cancellation notice without taking further goal action. If the goal is edited, the host aborts the old call, records a restart notice, and validates the complete conversation against the new revision.

The host rejects autonomous `update_goal` calls with `complete` or `blocked`, so the model cannot bypass validation or trigger the former terminal wrap-up context. Direct-human goal mutations remain available.

The planner is skipped for nested agents, plugin messages, and disabled configurations. Enabled direct requests are published to the session immediately, so the user message is visible while the auxiliary planner is running; the parent model request is admitted only after the planner returns one valid `emit_goal` call. Duplicate pre-step delivery of the same claimed request shares one in-flight planner call. A malformed structured result or model output-limit response is sent back to the same planner as validator feedback; each attempt gets the full configured timeout, with at most ten attempts total. The validation diagnostic is always the final user message in the auxiliary retry request, while the complete malformed model output, including invalid tool calls, is replaced by a compact assistant marker before retry. Every planner and validator request uses temperature `0`. If all ten attempts remain invalid, the turn fails with a structured plan-goal error containing the elapsed time. Planner timeouts retain the `PLAN_GOAL_TIMEOUT` error code.

## Configuration

```yaml
- id: plan-goal
  name: '@ddonofrio/littlewhale-plan-goal'
  config:
    enabled: false
    timeoutMs: 300000
```

The `enabled` value is also exposed as the `plan-goal` General setting. It defaults to `false` and applies live to direct user requests. The timeout applies to both the planner and the mandatory active-goal validator.

## Model Experience

### Goal planning request

#### What the model sees

The main agent does not see the planner tool. Before the parent step is admitted, the auxiliary call receives only the synthetic `emit_goal` result tool and uses `purpose: 'goal'`. It inherits the selected model's maximum output budget and reasoning policy. The original user message is published unchanged as soon as planning begins, so it can be displayed while the planner runs. Its tool arguments are validated before a separate plugin-sourced notice is appended: `SYSTEM: Just created the goal: <goal>` followed by `PLEASE STICK TO YOUR GOAL.` Non-text content such as images remains attached to the original request. The goal domain and its existing continuation driver are updated with the same validated text. The parent request is never started without that result.

#### Token effect

The planner sends the clean transcript and newly claimed request once in its auxiliary chat. If local validation rejects the response, each retry adds the prior assistant turn and one correction message to that chat; the normalized goal text is then retained as one ordinary user-role message in the parent session.

#### KV Cache effect

The planner chat is separate from the parent request and does not extend the parent's cached context. Only the durable goal change and the ordinary parent request affect later parent assembly.

### Goal validation

#### What the model sees

After the agent has produced a normal response, the user sees `Validating response…` while the auxiliary validator reads the clean transcript. The validator receives no tools and cannot modify the workspace. A completed goal adds `Goal completed: <reason>` to the conversation; an unfinished or indeterminate goal sends `Questioning agent: <reason>` to the agent and displays that same message before the follow-up response.

#### Token effect

Each completed response with an armed goal adds one validator request, plus any local format retries in the same auxiliary chat. A validation result does not extend the parent model's cached context; only its visible notices and any follow-up agent step do so.

#### KV Cache effect

The validator chat is separate from the parent request and does not extend the parent's cached context. Only the visible notices and any follow-up agent step affect later parent assembly.

## Known Limitations and Deferred Work

- Goal derivation and validation are model-assisted and are not correctness guarantees; validation fails closed by keeping the goal active and requesting more work.
- The clean transcript intentionally omits runtime context and successful raw tool results, matching the completion-checker projection.
