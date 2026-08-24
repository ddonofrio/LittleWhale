/** Model-visible continuation prompt for one same-session goal round. */

import type { ContentBlock, ToolSchema } from '@deepseek-ai/dsh-llm'
import type { GoalView } from '@deepseek-ai/dsh-goal'

const GOAL_TOOL_NAMES = new Set(['get_goal', 'update_goal'])

/** Keep only the controls an autonomous goal round may use.
 * @param tools - current model-visible tool schemas.
 * @returns the goal lifecycle schemas allowed in an autonomous round.
 */
export function goalRoundToolSchemas(tools: readonly ToolSchema[]): ToolSchema[] {
  return tools
    .filter(tool => GOAL_TOOL_NAMES.has(tool.name))
    .map(({ name, description, parameters }) => ({ name, description, parameters }))
}

/**
 * Render the complete goal-round instruction retained in session history.
 * @param goal - exact active goal revision being admitted.
 * @param round - next positive round number.
 * @param tools - current model-visible tool schemas, filtered to goal controls.
 * @returns a fresh one-block prompt for `Agent.followup()`.
 */
export function renderGoalRoundPrompt(
  goal: GoalView,
  round: number,
  tools: readonly ToolSchema[] = [],
): ContentBlock[] {
  const goalTools = goalRoundToolSchemas(tools)
  return [{
    type: 'text',
    text: '<SYSTEM PROMPT>\n'
      + '<goal_round>\n'
      + `Objective: ${JSON.stringify(goal.objective)}\n`
      + `Round: ${round}/${goal.maxGoalRounds}\n\n`
      + '<goal_tools>\n'
      + 'This autonomous round can update the goal only through the following tools. If the '
      + 'objective is complete, call get_goal and then update_goal with action "complete"; a '
      + 'text-only claim does not change the goal. If work remains, keep the goal active.\n'
      + `${JSON.stringify(goalTools)}\n`
      + '</goal_tools>\n\n'
      + 'Continue working toward the objective in this same session. Treat the current workspace, '
      + 'tool results, and durable session state as authoritative; inspect them instead of assuming '
      + 'earlier narration is still current. Make concrete progress and verify the result. Before '
      + 'claiming completion, gather evidence that the whole objective is achieved, read the current '
      + 'goal, and mark it complete. If work remains, leave the goal active for the next round. Follow '
      + 'the configured goal-tool policy before reporting a blocker.\n'
      + '</goal_round>\n'
      + 'REMEMBER: THIS IS NOT AN USERS MESSAGE! DO NOT ANSWER AS IF IT WERE. THIS IS A SYSTEM INSTRUCTION FOR YOU TO FOLLOW.\n'
      + '</SYSTEM PROMPT>',
  }]
}
