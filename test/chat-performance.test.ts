import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSession } from '../src/renderer/chat/parser.ts';
import type { JsonlEntry } from '../src/shared/types/jsonl.ts';

// ── Synthetic session generator ─────────────────────────────────────

const generateSession = (turns: number): JsonlEntry[] => {
  const entries: JsonlEntry[] = [];
  let toolId = 0;

  for (let i = 0; i < turns; i++) {
    // User message
    entries.push({
      type: 'user',
      message: { role: 'user', content: `Question ${i}: ${'x'.repeat(100)}` },
      timestamp: new Date(Date.now() + i * 60000).toISOString(),
    });

    // Assistant with thinking + text + tool_use
    entries.push({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: `Thinking about question ${i}... ${'y'.repeat(200)}` },
          { type: 'text', text: `Let me help with that. ${'z'.repeat(150)}` },
          {
            type: 'tool_use',
            id: `tu_${toolId}`,
            name: i % 3 === 0 ? 'Bash' : i % 3 === 1 ? 'Read' : 'Edit',
            input:
              i % 3 === 0
                ? { command: `echo ${'output '.repeat(20)}` }
                : i % 3 === 1
                  ? { file_path: `/src/file-${i}.ts` }
                  : { file_path: `/src/file-${i}.ts`, old_string: 'old', new_string: 'new' },
          },
        ] as never,
      },
      costUSD: 0.001 * (i + 1),
      durationMs: 100 + i * 10,
    });

    // Large tool result (multi-KB)
    const resultContent = `${'Line of output content for tool result. '.repeat(50)}\n`.repeat(5);
    entries.push({
      type: 'result',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_result',
            tool_use_id: `tu_${toolId}`,
            content: resultContent,
            is_error: i % 20 === 0, // occasional errors
          },
        ] as never,
      },
      costUSD: 0.0005,
    });

    toolId++;

    // Every 5th turn: assistant does a second tool call
    if (i % 5 === 0) {
      entries.push({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: `tu_${toolId}`,
              name: 'Bash',
              input: { command: 'npm test' },
            },
          ] as never,
        },
        costUSD: 0.001,
        durationMs: 50,
      });

      entries.push({
        type: 'result',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_result',
              tool_use_id: `tu_${toolId}`,
              content: `Test output: ${'PASS '.repeat(100)}`,
            },
          ] as never,
        },
      });

      toolId++;
    }

    // Final assistant response for the turn
    entries.push({
      type: 'assistant',
      message: { role: 'assistant', content: `Done with task ${i}. ${'w'.repeat(100)}` },
      costUSD: 0.005,
      durationMs: 200,
    });
  }

  // Add some system entries
  entries.push({ type: 'system', content: '/help', subtype: 'command' });
  entries.push({ type: 'system', content: 'Session info', subtype: 'info' });

  return entries;
};

// ── Tests ───────────────────────────────────────────────────────────

describe('chat parser performance', () => {
  it('parses 250-turn session (1000+ entries) under 2000ms', () => {
    const entries = generateSession(250);
    assert.ok(entries.length > 1000, `Expected 1000+ entries, got ${entries.length}`);

    const start = performance.now();
    const blocks = parseSession(entries);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 2000, `Parse took ${elapsed.toFixed(1)}ms, expected < 2000ms`);
    assert.ok(blocks.length > 0, 'Should produce blocks');

    // Verify all expected block types are present
    const types = new Set(blocks.map((b) => b.type));
    assert.ok(types.has('user-message'), 'Missing user-message blocks');
    assert.ok(types.has('assistant-text'), 'Missing assistant-text blocks');
    assert.ok(types.has('tool-use'), 'Missing tool-use blocks');
    assert.ok(types.has('tool-result'), 'Missing tool-result blocks');
    assert.ok(types.has('thinking'), 'Missing thinking blocks');
    assert.ok(types.has('error'), 'Missing error blocks');
    assert.ok(types.has('system'), 'Missing system blocks');
    assert.ok(types.has('cost-summary'), 'Missing cost-summary block');
  });

  it('parses 500-turn session (2000+ entries) under 2000ms', () => {
    const entries = generateSession(500);
    assert.ok(entries.length > 2000, `Expected 2000+ entries, got ${entries.length}`);

    const start = performance.now();
    const blocks = parseSession(entries);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 2000, `Parse took ${elapsed.toFixed(1)}ms, expected < 2000ms`);
    assert.ok(blocks.length > 1000, `Expected 1000+ blocks, got ${blocks.length}`);
  });

  it('handles entries with very large tool results', () => {
    const largeContent = 'x'.repeat(100_000); // 100KB single result
    const entries: JsonlEntry[] = [
      {
        type: 'user',
        message: { role: 'user', content: 'big output' },
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu_big', name: 'Bash', input: { command: 'cat big.log' } },
          ] as never,
        },
      },
      {
        type: 'result',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_result', tool_use_id: 'tu_big', content: largeContent },
          ] as never,
        },
      },
    ];

    const start = performance.now();
    const blocks = parseSession(entries);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 500, `Large result parse took ${elapsed.toFixed(1)}ms`);
    const result = blocks.find((b) => b.type === 'tool-result');
    assert.ok(result && result.type === 'tool-result');
    assert.equal(result.content.length, 100_000);
  });
});
