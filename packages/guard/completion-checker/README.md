# @deepseek-ai/dsh-completion-checker

The completion checker provides an optional automatic master-model review after a student model completes a turn that used at least one tool. The master runs as a one-shot subagent, receives the clean Auto Goal/Auto TODO transcript, and reviews the response and affected files without changing them.

## Configuration

```yaml
- id: completion-checker
  name: '@deepseek-ai/dsh-completion-checker'
  config:
    enabled: true
    provider: spawn
```

The `enabled` field is also available in the `completion-checker` settings namespace. A master provider and model must be selected before the feature can be used. `/master` toggles the feature; `/master on` and `/master off` select an explicit state. The composer blocks submission until a valid master model different from the student model is selected.

## Review protocol

The master returns structured output with `status: "OK"` or `status: "KO"`, plus an `instruction` string.

- `OK` tells the student to report that the response was validated successfully.
- `KO` sends the instruction back as a real user message, so user-triggered automations such as Auto Goal and Auto TODOs run normally before the student continues. Review repeats after every corrective turn until `OK` or an inability-to-complete instruction stops the task.
- An inability-to-complete `KO` tells the student to stop and report that it is less capable than the task.

The master is strictly read-only. It must not edit, create, delete, rename, format, or otherwise modify files. It must use the parent session's project directory as its only project root and must not inspect external directories unless the user explicitly requested one.

The review runs only after a completed top-level student turn that used at least one tool. Nested reviewer agents and loop-recovery turns are excluded. Reviewer failures are logged and do not replace the student's response.

## Model Experience

### Conversation history

#### What the model sees

The master receives a clean chronological transcript in the same format used by Auto Goal and Auto TODOs: direct user messages, assistant text, compact tool-activity entries, failed tool results, and TODO state. Runtime context, model reasoning, raw tool payloads, and raw tool results are excluded. The project directory is included separately so the master can verify files without drifting outside the workspace. The review is an additional model request after a tool-using student turn and is instructed to review without modifying files.

#### Token effect

The review adds one independent master request after the student's tool-using turn.

#### KV Cache effect

The review request uses the master route's own cache and does not alter the student's cache.

## Known Limitations and Deferred Work

- The master review is best-effort: provider failures are logged and leave the student's response unchanged.
