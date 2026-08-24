# @deepseek-ai/dsh-compaction-policy

The compaction policy owns the durable automatic-compaction threshold. Its global default is `75%` of the complete context window. Each exact `provider/model` route may store an override; routes without one inherit the global value.

The Host registers the `compaction-policy` settings namespace and exposes `ctx.compactionPolicy`. The browser binds the same namespace through the settings scope, so General and the current chat edit one durable document and observe one another's committed changes.

The policy stores a ratio, not a token count. A UI converts the ratio to `floor(contextWindow × ratio)` for the active route, so the displayed token estimate changes when the model's advertised context window changes while the saved percentage remains stable.

## Model Experience

### Conversation history, when the policy is used

#### What the model sees

No additional model-visible content. The policy only changes when the compaction backend replaces retained history with its summary checkpoint.

#### Token effect

Automatic compaction begins at the effective route ratio from `ctx.compactionPolicy`, subject to the backend's output-capacity safety reserve. A successful compaction reduces retained history before the next model request.

#### KV Cache effect

The compaction checkpoint invalidates reuse from the first shadowed history token; the policy itself adds no request content.

## Known Limitations and Deferred Work

- The settings document keys overrides by exact provider/model identity. Renaming or removing a route leaves its stored override until it is cleared from the settings document.
