/**
 * Conservative token pricing shared by the meter service and the
 * pure context-breakdown projection, so both surfaces price identical content
 * to identical numbers.
 *
 * @module @deepseek-ai/dsh-token-meter/estimate
 */

import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'
import type { EpochHeader } from '@deepseek-ai/dsh-session'

/** Conservative density for ASCII text whose tokenizer is unknown. */
const ASCII_CHARS_PER_TOKEN = 4

/** Per-block structural overhead for JSON framing and type tags. */
const BLOCK_OVERHEAD = 4

/** Role-field framing overhead added to every priced message. */
export const ROLE_OVERHEAD = 4

/**
 * Price content blocks recursively under the conservative heuristic.
 * @param blocks - content blocks to price without mutation.
 * @returns heuristic tokens including per-block structural overhead.
 */
export function estimateContent(blocks: readonly ContentBlock[]): number {
  let tokens = 0
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
      case 'reasoning':
        tokens += estimateText(block.text) + BLOCK_OVERHEAD
        break
      case 'tool-call':
        tokens += estimateText(block.name)
          + estimateText(block.arguments)
          + BLOCK_OVERHEAD
        break
      case 'tool-result':
        tokens += estimateContent(block.content) + BLOCK_OVERHEAD
        break
      default:
        // ContentBlockMap is merge-extensible; unknown blocks retain a
        // conservative structural JSON price under the shared heuristic.
        tokens += BLOCK_OVERHEAD + estimateText(JSON.stringify(block))
    }
  }
  return tokens
}

/**
 * Heuristically price one model-visible message.
 * @param message - message to price without mutation.
 * @returns content and role-framing tokens under the conservative heuristic.
 */
export function estimateMessage(message: Message): number {
  return estimateContent(message.content) + ROLE_OVERHEAD
}

/**
 * Price the system-prompt part of a canonical request envelope.
 * @param header - canonical envelope, or undefined before any request.
 * @returns heuristic system-prompt tokens; 0 when absent.
 */
export function estimateSystemTokens(header: EpochHeader | undefined): number {
  if (header?.system === undefined) return 0
  return estimateText(header.system) + ROLE_OVERHEAD
}

/**
 * Price the tool-schema part of a canonical request envelope.
 * @param header - canonical envelope, or undefined before any request.
 * @returns heuristic tool-schema tokens; 0 when absent or empty.
 */
export function estimateToolsTokens(header: EpochHeader | undefined): number {
  if (header?.tools === undefined || header.tools.length === 0) return 0
  return estimateText(JSON.stringify(header.tools)) + BLOCK_OVERHEAD
}

/**
 * Price the complete non-surface request envelope.
 * @param header - canonical envelope, or undefined before any request.
 * @returns heuristic system plus tool tokens.
 */
export function estimateHeader(header: EpochHeader | undefined): number {
  return estimateSystemTokens(header) + estimateToolsTokens(header)
}

/**
 * Conservatively price text without assuming that all scripts share an ASCII
 * tokenizer density. Non-ASCII code points each reserve one token because
 * CJK, emoji, and mixed tool output can otherwise grow far faster than their
 * UTF-16 length divided by a single global density suggests.
 */
function estimateText(text: string): number {
  let ascii = 0
  let nonAscii = 0
  for (const codePoint of text) {
    const value = codePoint.codePointAt(0)
    if (value !== undefined && value <= 0x7f) ascii += 1
    else nonAscii += 1
  }
  return Math.ceil(ascii / ASCII_CHARS_PER_TOKEN) + nonAscii
}
