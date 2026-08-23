import { describe, expect, it } from 'vitest'
import { CallId } from '@deepseek-ai/dsh-llm'
import { detectTokenLoop, loopTextForChunk, tokenizeLoopText, type LoopDetectionStreamSelection } from '../src/loop-detector.ts'

const allStreams: LoopDetectionStreamSelection = { text: true, reasoning: true, toolCall: true }

describe('detectTokenLoop', () => {
  it('detects a triple repeated suffix and returns its coordinates', () => {
    const tokens = ['before', 'a', 'b', 'c', 'd', 'e', 'a', 'b', 'c', 'd', 'e', 'a', 'b', 'c', 'd', 'e']
    expect(detectTokenLoop(tokens)).toEqual({
      start: 1,
      length: 5,
      block: ['a', 'b', 'c', 'd', 'e'],
    })
  })

  it('does not classify a double repetition or a short block as a loop', () => {
    expect(detectTokenLoop(['a', 'b', 'c', 'd', 'e', 'a', 'b', 'c', 'd', 'e'])).toBeUndefined()
    expect(detectTokenLoop(['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd', 'a', 'b', 'c', 'd'])).toBeUndefined()
  })

  it('tokenizes text consistently across words and punctuation', () => {
    expect(tokenizeLoopText('One, two! One, two!')).toEqual(['One', ',', 'two', '!', 'One', ',', 'two', '!'])
  })

  it('collects reasoning and tool-call content without duplicating block-end content', () => {
    const deltaIndexes = new Set<number>()
    expect(loopTextForChunk({ type: 'reasoning-delta', index: 0, text: 'thinking' }, deltaIndexes, allStreams)).toBe('thinking')
    expect(loopTextForChunk({ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'thinking' } }, deltaIndexes, allStreams)).toBeUndefined()
    expect(loopTextForChunk({
      type: 'tool-call-delta', index: 1, id: CallId('call-1'), name: 'read', argumentsDelta: '{"path":"x"}',
    }, deltaIndexes, allStreams)).toBe('read{"path":"x"}')
    expect(loopTextForChunk({
      type: 'block-end', index: 2, block: { type: 'tool-call', id: CallId('call-2'), name: 'read', arguments: '{"path":"x"}' },
    }, deltaIndexes, allStreams)).toBe('read{"path":"x"}')
  })

  it('excludes each stream category independently', () => {
    const selection: LoopDetectionStreamSelection = { text: false, reasoning: true, toolCall: false }
    const deltaIndexes = new Set<number>()

    expect(loopTextForChunk({ type: 'text-delta', index: 0, text: 'answer' }, deltaIndexes, selection)).toBeUndefined()
    expect(loopTextForChunk({ type: 'reasoning-delta', index: 1, text: 'thinking' }, deltaIndexes, selection)).toBe('thinking')
    expect(loopTextForChunk({
      type: 'block-end', index: 2, block: { type: 'tool-call', id: CallId('call-2'), name: 'read', arguments: '{}' },
    }, deltaIndexes, selection)).toBeUndefined()
  })
})
