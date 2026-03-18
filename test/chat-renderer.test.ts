import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSession } from '../src/renderer/chat/parser.ts';
import type { JsonlEntry } from '../src/shared/types/jsonl.ts';
import type { ChatBlock } from '../src/renderer/chat/types.ts';

// ── Helpers ─────────────────────────────────────────────────────────

const userEntry = (text: string, timestamp?: string): JsonlEntry => ({
  type: 'user',
  message: { role: 'user', content: text },
  timestamp,
});

const assistantText = (text: string, opts: { costUSD?: number; durationMs?: number } = {}): JsonlEntry => ({
  type: 'assistant',
  message: { role: 'assistant', content: text },
  costUSD: opts.costUSD,
  durationMs: opts.durationMs,
});

const assistantBlocks = (
  content: unknown[],
  opts: { costUSD?: number; durationMs?: number } = {},
): JsonlEntry => ({
  type: 'assistant',
  message: { role: 'assistant', content: content as never },
  costUSD: opts.costUSD,
  durationMs: opts.durationMs,
});

const resultEntry = (toolResults: unknown[], opts: { costUSD?: number } = {}): JsonlEntry => ({
  type: 'result',
  message: { role: 'assistant', content: toolResults as never },
  costUSD: opts.costUSD,
});

const systemEntry = (content: string, subtype?: string): JsonlEntry => ({
  type: 'system',
  content,
  subtype,
});

const blockTypes = (blocks: ChatBlock[]): string[] => blocks.map((b) => b.type);

// ── All block types ─────────────────────────────────────────────────

describe('all block types produced', () => {
  it('produces user-message from user entry', () => {
    const blocks = parseSession([userEntry('hello')]);
    assert.ok(blocks.some((b) => b.type === 'user-message'));
  });

  it('produces assistant-text from assistant entry', () => {
    const blocks = parseSession([userEntry('q'), assistantText('answer')]);
    assert.ok(blocks.some((b) => b.type === 'assistant-text'));
  });

  it('produces tool-use from assistant tool_use block', () => {
    const blocks = parseSession([
      userEntry('do it'),
      assistantBlocks([{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }]),
    ]);
    assert.ok(blocks.some((b) => b.type === 'tool-use'));
  });

  it('produces tool-result from result entry', () => {
    const blocks = parseSession([
      userEntry('do it'),
      assistantBlocks([{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }]),
      resultEntry([{ type: 'tool_result', tool_use_id: 'tu_1', content: 'output' }]),
    ]);
    assert.ok(blocks.some((b) => b.type === 'tool-result'));
  });

  it('produces thinking from assistant thinking block', () => {
    const blocks = parseSession([
      userEntry('think'),
      assistantBlocks([{ type: 'thinking', thinking: 'hmm...' }]),
    ]);
    assert.ok(blocks.some((b) => b.type === 'thinking'));
  });

  it('produces error from tool result with is_error', () => {
    const blocks = parseSession([
      userEntry('fail'),
      assistantBlocks([{ type: 'tool_use', id: 'tu_e', name: 'Bash', input: { command: 'false' } }]),
      resultEntry([{ type: 'tool_result', tool_use_id: 'tu_e', content: 'error msg', is_error: true }]),
    ]);
    assert.ok(blocks.some((b) => b.type === 'error'));
  });

  it('produces image from assistant image block', () => {
    const blocks = parseSession([
      userEntry('show'),
      assistantBlocks([
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
      ]),
    ]);
    assert.ok(blocks.some((b) => b.type === 'image'));
  });

  it('produces system from system entry', () => {
    const blocks = parseSession([systemEntry('/help', 'command')]);
    assert.ok(blocks.some((b) => b.type === 'system'));
  });

  it('produces cost-summary when messages exist', () => {
    const blocks = parseSession([userEntry('hi'), assistantText('hello')]);
    assert.ok(blocks.some((b) => b.type === 'cost-summary'));
  });
});

// ── Multi-turn conversation ─────────────────────────────────────────

describe('realistic multi-turn conversation', () => {
  const session: JsonlEntry[] = [
    // Turn 1: user asks, assistant thinks + responds
    userEntry('Find and fix the bug in app.ts', '2025-06-01T10:00:00Z'),
    assistantBlocks(
      [
        { type: 'thinking', thinking: 'I need to read the file first.' },
        { type: 'text', text: 'Let me look at the file.' },
        { type: 'tool_use', id: 'tu_read', name: 'Read', input: { file_path: '/src/app.ts' } },
      ],
      { costUSD: 0.02, durationMs: 800 },
    ),
    resultEntry([
      {
        type: 'tool_result',
        tool_use_id: 'tu_read',
        content: 'const x = 1;\nconst y = x + "2";\n',
      },
    ]),

    // Turn 2: assistant edits the file
    assistantBlocks(
      [
        { type: 'text', text: 'Found a type coercion bug. Fixing it.' },
        {
          type: 'tool_use',
          id: 'tu_edit',
          name: 'Edit',
          input: { file_path: '/src/app.ts', old_string: 'x + "2"', new_string: 'x + 2' },
        },
      ],
      { costUSD: 0.015, durationMs: 600 },
    ),
    resultEntry([
      { type: 'tool_result', tool_use_id: 'tu_edit', content: 'Edit applied' },
    ]),

    // Turn 3: assistant runs a command that fails
    assistantBlocks(
      [
        { type: 'tool_use', id: 'tu_bash', name: 'Bash', input: { command: 'npm test' } },
      ],
      { costUSD: 0.01, durationMs: 300 },
    ),
    resultEntry([
      { type: 'tool_result', tool_use_id: 'tu_bash', content: 'Test failed: expected 3', is_error: true },
    ]),

    // Turn 4: user follows up
    userEntry('Try a different approach', '2025-06-01T10:02:00Z'),
    assistantText('OK, let me reconsider.', { costUSD: 0.005, durationMs: 200 }),

    // System entry
    systemEntry('Session resumed', 'info'),
  ];

  it('produces correct block type sequence', () => {
    const blocks = parseSession(session);
    const types = blockTypes(blocks);

    assert.deepStrictEqual(types, [
      'user-message',
      'thinking',
      'assistant-text',
      'tool-use',
      'tool-result',
      'assistant-text',
      'tool-use',
      'tool-result',
      'tool-use',
      'tool-result',
      'error',
      'user-message',
      'assistant-text',
      'system',
      'cost-summary',
    ]);
  });

  it('pairs tool-use with tool-result correctly', () => {
    const blocks = parseSession(session);

    const readUse = blocks.find((b) => b.type === 'tool-use' && b.toolName === 'Read');
    assert.ok(readUse && readUse.type === 'tool-use');
    assert.ok(readUse.result);
    assert.equal(readUse.result.toolName, 'Read');
    assert.equal(readUse.result.filePath, '/src/app.ts');

    const editUse = blocks.find((b) => b.type === 'tool-use' && b.toolName === 'Edit');
    assert.ok(editUse && editUse.type === 'tool-use');
    assert.ok(editUse.result);
    assert.ok(editUse.result.editDiff);
    assert.equal(editUse.result.editDiff.oldString, 'x + "2"');
    assert.equal(editUse.result.editDiff.newString, 'x + 2');
  });

  it('flags error tool results', () => {
    const blocks = parseSession(session);

    const errorResult = blocks.find(
      (b) => b.type === 'tool-result' && b.toolName === 'Bash',
    );
    assert.ok(errorResult && errorResult.type === 'tool-result');
    assert.equal(errorResult.isError, true);

    const errorBlock = blocks.find((b) => b.type === 'error');
    assert.ok(errorBlock && errorBlock.type === 'error');
    assert.equal(errorBlock.message, 'Tool error: Bash');
  });

  it('aggregates cost summary across all entries', () => {
    const blocks = parseSession(session);
    const summary = blocks.find((b) => b.type === 'cost-summary');
    assert.ok(summary && summary.type === 'cost-summary');
    assert.ok(summary.totalCostUSD > 0.04);
    assert.equal(summary.totalDurationMs, 800 + 600 + 300 + 200);
    assert.ok(summary.messageCount >= 5); // 2 user + 3+ assistant
  });

  it('preserves timestamps on user messages', () => {
    const blocks = parseSession(session);
    const users = blocks.filter((b) => b.type === 'user-message');
    assert.equal(users.length, 2);
    if (users[0]!.type === 'user-message') {
      assert.equal(users[0]!.timestamp, '2025-06-01T10:00:00Z');
    }
    if (users[1]!.type === 'user-message') {
      assert.equal(users[1]!.timestamp, '2025-06-01T10:02:00Z');
    }
  });

  it('includes system block with subtype', () => {
    const blocks = parseSession(session);
    const sys = blocks.find((b) => b.type === 'system');
    assert.ok(sys && sys.type === 'system');
    assert.equal(sys.text, 'Session resumed');
    assert.equal(sys.subtype, 'info');
  });
});

// ── User images in content blocks ───────────────────────────────────

describe('user image content blocks', () => {
  it('extracts multiple images from user entry', () => {
    const entry: JsonlEntry = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'compare these' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'img1' } },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'img2' } },
        ] as never,
      },
    };
    const blocks = parseSession([entry]);
    const user = blocks[0]!;
    assert.equal(user.type, 'user-message');
    if (user.type !== 'user-message') return;
    assert.equal(user.text, 'compare these');
    assert.equal(user.images.length, 2);
    assert.equal(user.images[0]!.mediaType, 'image/png');
    assert.equal(user.images[1]!.mediaType, 'image/jpeg');
  });
});

// ── Multiple tool calls in one assistant turn ───────────────────────

describe('multiple tool calls in one turn', () => {
  it('produces separate tool-use blocks for each tool call', () => {
    const blocks = parseSession([
      userEntry('read both files'),
      assistantBlocks([
        { type: 'tool_use', id: 'tu_a', name: 'Read', input: { file_path: '/a.ts' } },
        { type: 'tool_use', id: 'tu_b', name: 'Read', input: { file_path: '/b.ts' } },
      ]),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_a', content: 'content a' },
        { type: 'tool_result', tool_use_id: 'tu_b', content: 'content b' },
      ]),
    ]);

    const toolUses = blocks.filter((b) => b.type === 'tool-use');
    assert.equal(toolUses.length, 2);

    const toolResults = blocks.filter((b) => b.type === 'tool-result');
    assert.equal(toolResults.length, 2);

    // Each tool-use should have its result paired
    if (toolUses[0]!.type === 'tool-use') assert.ok(toolUses[0]!.result);
    if (toolUses[1]!.type === 'tool-use') assert.ok(toolUses[1]!.result);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty assistant content gracefully', () => {
    const blocks = parseSession([
      userEntry('hi'),
      assistantBlocks([]),
    ]);
    // Should still have user-message and cost-summary (assistant increments count)
    assert.ok(blocks.some((b) => b.type === 'user-message'));
    assert.ok(blocks.some((b) => b.type === 'cost-summary'));
  });

  it('handles tool result without matching tool use', () => {
    const blocks = parseSession([
      userEntry('orphan result'),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'orphan_id', content: 'no match' },
      ]),
    ]);
    const result = blocks.find((b) => b.type === 'tool-result');
    assert.ok(result && result.type === 'tool-result');
    assert.equal(result.toolName, 'unknown');
  });

  it('handles mixed legacy + modern entries', () => {
    const blocks = parseSession([
      { type: 'message' as const, role: 'user' as const, content: 'legacy question' },
      assistantText('modern answer', { costUSD: 0.01 }),
    ]);

    const types = blockTypes(blocks);
    assert.ok(types.includes('user-message'));
    assert.ok(types.includes('assistant-text'));
  });

  it('skips non-renderable entry types', () => {
    const blocks = parseSession([
      { type: 'init' as const, cwd: '/home', sessionId: 'abc' },
      { type: 'summary' as const, summary: 'sum' },
      { type: 'custom-title' as const, customTitle: 'title' },
      { type: 'progress' as const, data: { type: 'bash_progress' } },
      userEntry('only renderable'),
    ]);
    // Only user-message + cost-summary
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0]!.type, 'user-message');
    assert.equal(blocks[1]!.type, 'cost-summary');
  });
});
