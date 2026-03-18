import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSession } from '../src/renderer/chat/parser.ts';

// ── Helpers ─────────────────────────────────────────────────────────

function userEntry(text: string, timestamp?: string) {
  return {
    type: 'user' as const,
    message: { role: 'user' as const, content: text },
    timestamp,
  };
}

function assistantEntry(
  content: string | unknown[],
  opts: { costUSD?: number; durationMs?: number; usage?: { input_tokens: number; output_tokens: number } } = {},
) {
  const message: Record<string, unknown> = { role: 'assistant', content };
  if (opts.usage) message.usage = opts.usage;
  return {
    type: 'assistant' as const,
    message: message as { role: 'assistant'; content: typeof content },
    costUSD: opts.costUSD,
    durationMs: opts.durationMs,
  };
}

function resultEntry(toolResults: unknown[], opts: { costUSD?: number } = {}) {
  return {
    type: 'result' as const,
    message: { role: 'assistant' as const, content: toolResults },
    costUSD: opts.costUSD,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('parseSession', () => {
  it('returns empty array for empty input', () => {
    const blocks = parseSession([]);
    assert.deepStrictEqual(blocks, []);
  });

  it('parses a basic user message with string content', () => {
    const blocks = parseSession([userEntry('hello', '2025-01-01T00:00:00Z')]);
    assert.equal(blocks.length, 2); // user + cost-summary
    const user = blocks[0]!;
    assert.equal(user.type, 'user-message');
    if (user.type !== 'user-message') return;
    assert.equal(user.text, 'hello');
    assert.equal(user.timestamp, '2025-01-01T00:00:00Z');
    assert.deepStrictEqual(user.images, []);
  });

  it('extracts images from user content blocks', () => {
    const entry = {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'look at this' },
          { type: 'image' as const, source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
        ],
      },
    };
    const blocks = parseSession([entry]);
    const user = blocks[0]!;
    assert.equal(user.type, 'user-message');
    if (user.type !== 'user-message') return;
    assert.equal(user.text, 'look at this');
    assert.equal(user.images.length, 1);
    assert.equal(user.images[0]!.mediaType, 'image/png');
    assert.equal(user.images[0]!.base64, 'abc123');
  });

  it('parses assistant text from string content', () => {
    const blocks = parseSession([
      userEntry('hi'),
      assistantEntry('hello back'),
    ]);
    const text = blocks.find((b) => b.type === 'assistant-text');
    assert.ok(text);
    if (text.type !== 'assistant-text') return;
    assert.equal(text.text, 'hello back');
  });

  it('parses assistant content array with text + thinking blocks', () => {
    const blocks = parseSession([
      userEntry('question'),
      assistantEntry([
        { type: 'thinking', thinking: 'let me think...' },
        { type: 'text', text: 'the answer' },
      ]),
    ]);

    const thinking = blocks.find((b) => b.type === 'thinking');
    assert.ok(thinking);
    if (thinking.type !== 'thinking') return;
    assert.equal(thinking.text, 'let me think...');

    const text = blocks.find((b) => b.type === 'assistant-text');
    assert.ok(text);
    if (text.type !== 'assistant-text') return;
    assert.equal(text.text, 'the answer');
  });

  it('parses assistant image blocks', () => {
    const blocks = parseSession([
      userEntry('show me'),
      assistantEntry([
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'imgdata' } },
      ]),
    ]);
    const img = blocks.find((b) => b.type === 'image');
    assert.ok(img);
    if (img.type !== 'image') return;
    assert.equal(img.mediaType, 'image/jpeg');
    assert.equal(img.base64, 'imgdata');
  });
});

describe('tool use/result pairing', () => {
  it('pairs tool_use with tool_result by ID', () => {
    const blocks = parseSession([
      userEntry('read the file'),
      assistantEntry([
        { type: 'tool_use', id: 'tu_1', name: 'Read', input: { file_path: '/tmp/test.txt' } },
      ]),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'file contents here' },
      ]),
    ]);

    const toolUse = blocks.find((b) => b.type === 'tool-use');
    assert.ok(toolUse);
    if (toolUse.type !== 'tool-use') return;
    assert.equal(toolUse.toolName, 'Read');
    assert.equal(toolUse.toolUseId, 'tu_1');
    assert.ok(toolUse.result, 'tool use should have paired result');
    assert.equal(toolUse.result.content, 'file contents here');
    assert.equal(toolUse.result.isError, false);

    const toolResult = blocks.find((b) => b.type === 'tool-result');
    assert.ok(toolResult);
    if (toolResult.type !== 'tool-result') return;
    assert.equal(toolResult.toolName, 'Read');
    assert.equal(toolResult.filePath, '/tmp/test.txt');
  });

  it('creates error block for tool results with is_error', () => {
    const blocks = parseSession([
      userEntry('run something'),
      assistantEntry([
        { type: 'tool_use', id: 'tu_err', name: 'Bash', input: { command: 'exit 1' } },
      ]),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_err', content: 'command failed', is_error: true },
      ]),
    ]);

    const errorBlock = blocks.find((b) => b.type === 'error');
    assert.ok(errorBlock);
    if (errorBlock.type !== 'error') return;
    assert.equal(errorBlock.message, 'Tool error: Bash');
    assert.equal(errorBlock.details, 'command failed');

    const toolResult = blocks.find((b) => b.type === 'tool-result');
    assert.ok(toolResult);
    if (toolResult.type !== 'tool-result') return;
    assert.equal(toolResult.isError, true);
  });

  it('handles tool result with output field', () => {
    const blocks = parseSession([
      userEntry('run it'),
      assistantEntry([
        { type: 'tool_use', id: 'tu_out', name: 'Bash', input: { command: 'echo hi' } },
      ]),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_out', content: '', output: 'hi\n' },
      ]),
    ]);

    const result = blocks.find((b) => b.type === 'tool-result');
    assert.ok(result);
    if (result.type !== 'tool-result') return;
    assert.equal(result.content, 'hi\n');
  });

  it('extracts content from tool result content blocks array', () => {
    const blocks = parseSession([
      userEntry('do it'),
      assistantEntry([
        { type: 'tool_use', id: 'tu_arr', name: 'Bash', input: { command: 'ls' } },
      ]),
      resultEntry([
        {
          type: 'tool_result',
          tool_use_id: 'tu_arr',
          content: [
            { type: 'text', text: 'line1' },
            { type: 'text', text: 'line2' },
          ],
        },
      ]),
    ]);

    const result = blocks.find((b) => b.type === 'tool-result');
    assert.ok(result);
    if (result.type !== 'tool-result') return;
    assert.equal(result.content, 'line1\nline2');
  });
});

describe('edit tool diff extraction', () => {
  it('extracts editDiff for Edit tool', () => {
    const blocks = parseSession([
      userEntry('fix the bug'),
      assistantEntry([
        {
          type: 'tool_use',
          id: 'tu_edit',
          name: 'Edit',
          input: { file_path: '/src/app.ts', old_string: 'foo()', new_string: 'bar()' },
        },
      ]),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_edit', content: 'Edit applied' },
      ]),
    ]);

    const result = blocks.find((b) => b.type === 'tool-result');
    assert.ok(result);
    if (result.type !== 'tool-result') return;
    assert.ok(result.editDiff);
    assert.equal(result.editDiff.filePath, '/src/app.ts');
    assert.equal(result.editDiff.oldString, 'foo()');
    assert.equal(result.editDiff.newString, 'bar()');
  });

  it('extracts editDiff for str_replace_editor tool name', () => {
    const blocks = parseSession([
      userEntry('fix it'),
      assistantEntry([
        {
          type: 'tool_use',
          id: 'tu_sre',
          name: 'str_replace_editor',
          input: { file_path: '/a.ts', old_string: 'x', new_string: 'y' },
        },
      ]),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_sre', content: 'ok' },
      ]),
    ]);

    const result = blocks.find((b) => b.type === 'tool-result');
    assert.ok(result);
    if (result.type !== 'tool-result') return;
    assert.ok(result.editDiff);
    assert.equal(result.editDiff.filePath, '/a.ts');
  });

  it('extracts filePath for Read tool', () => {
    const blocks = parseSession([
      userEntry('read it'),
      assistantEntry([
        { type: 'tool_use', id: 'tu_read', name: 'Read', input: { file_path: '/src/index.ts' } },
      ]),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_read', content: 'contents' },
      ]),
    ]);

    const result = blocks.find((b) => b.type === 'tool-result');
    assert.ok(result);
    if (result.type !== 'tool-result') return;
    assert.equal(result.filePath, '/src/index.ts');
    assert.equal(result.editDiff, undefined);
  });

  it('extracts filePath for Write tool', () => {
    const blocks = parseSession([
      userEntry('write it'),
      assistantEntry([
        { type: 'tool_use', id: 'tu_write', name: 'Write', input: { file_path: '/out.txt', content: 'data' } },
      ]),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_write', content: 'written' },
      ]),
    ]);

    const result = blocks.find((b) => b.type === 'tool-result');
    assert.ok(result);
    if (result.type !== 'tool-result') return;
    assert.equal(result.filePath, '/out.txt');
  });
});

describe('cost aggregation', () => {
  it('aggregates costs into a CostSummaryBlock', () => {
    const blocks = parseSession([
      userEntry('q1'),
      assistantEntry('a1', { costUSD: 0.01, durationMs: 100 }),
      userEntry('q2'),
      assistantEntry('a2', { costUSD: 0.02, durationMs: 200 }),
    ]);

    const summary = blocks.find((b) => b.type === 'cost-summary');
    assert.ok(summary);
    if (summary.type !== 'cost-summary') return;
    assert.ok(Math.abs(summary.totalCostUSD - 0.03) < 1e-9);
    assert.equal(summary.totalDurationMs, 300);
    assert.equal(summary.messageCount, 4); // 2 user + 2 assistant
  });

  it('includes result entry costs', () => {
    const blocks = parseSession([
      userEntry('do it'),
      assistantEntry([
        { type: 'tool_use', id: 'tu_c', name: 'Bash', input: { command: 'ls' } },
      ], { costUSD: 0.01 }),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_c', content: 'ok' },
      ], { costUSD: 0.005 }),
    ]);

    const summary = blocks.find((b) => b.type === 'cost-summary');
    assert.ok(summary);
    if (summary.type !== 'cost-summary') return;
    assert.ok(Math.abs(summary.totalCostUSD - 0.015) < 1e-9);
  });

  it('aggregates usage tokens from message.usage', () => {
    const blocks = parseSession([
      userEntry('q'),
      assistantEntry('a', { costUSD: 0.01, usage: { input_tokens: 100, output_tokens: 50 } }),
    ]);

    const summary = blocks.find((b) => b.type === 'cost-summary');
    assert.ok(summary);
    if (summary.type !== 'cost-summary') return;
    assert.equal(summary.totalInputTokens, 100);
    assert.equal(summary.totalOutputTokens, 50);
  });

  it('attaches per-message cost to AssistantTextBlock', () => {
    const blocks = parseSession([
      userEntry('q'),
      assistantEntry('answer', { costUSD: 0.05, durationMs: 500 }),
    ]);

    const text = blocks.find((b) => b.type === 'assistant-text');
    assert.ok(text);
    if (text.type !== 'assistant-text') return;
    assert.equal(text.costUSD, 0.05);
    assert.equal(text.durationMs, 500);
  });
});

describe('legacy message format', () => {
  it('parses legacy user message', () => {
    const blocks = parseSession([
      { type: 'message' as const, role: 'user' as const, content: 'old format hello' },
    ]);

    const user = blocks[0]!;
    assert.equal(user.type, 'user-message');
    if (user.type !== 'user-message') return;
    assert.equal(user.text, 'old format hello');
  });

  it('parses legacy assistant message with message wrapper', () => {
    const blocks = parseSession([
      {
        type: 'message' as const,
        role: 'assistant' as const,
        message: { role: 'assistant' as const, content: 'old response' },
        costUSD: 0.01,
      },
    ]);

    const text = blocks.find((b) => b.type === 'assistant-text');
    assert.ok(text);
    if (text.type !== 'assistant-text') return;
    assert.equal(text.text, 'old response');
    assert.equal(text.costUSD, 0.01);
  });

  it('parses legacy assistant message with direct content', () => {
    const blocks = parseSession([
      { type: 'message' as const, role: 'assistant' as const, content: 'direct content' },
    ]);

    const text = blocks.find((b) => b.type === 'assistant-text');
    assert.ok(text);
    if (text.type !== 'assistant-text') return;
    assert.equal(text.text, 'direct content');
  });
});

describe('system and unknown entries', () => {
  it('parses system entries', () => {
    const blocks = parseSession([
      { type: 'system' as const, content: '/help', subtype: 'command' },
    ]);
    // system entries don't increment messageCount, so no cost-summary
    assert.equal(blocks.length, 1);
    const sys = blocks[0]!;
    assert.equal(sys.type, 'system');
    if (sys.type !== 'system') return;
    assert.equal(sys.text, '/help');
    assert.equal(sys.subtype, 'command');
  });

  it('skips init entries', () => {
    const blocks = parseSession([
      { type: 'init' as const, cwd: '/home', sessionId: 'abc' },
    ]);
    assert.deepStrictEqual(blocks, []);
  });

  it('skips summary entries', () => {
    const blocks = parseSession([
      { type: 'summary' as const, summary: 'Session summary' },
    ]);
    assert.deepStrictEqual(blocks, []);
  });

  it('skips custom-title entries', () => {
    const blocks = parseSession([
      { type: 'custom-title' as const, customTitle: 'My Session' },
    ]);
    assert.deepStrictEqual(blocks, []);
  });

  it('skips progress entries', () => {
    const blocks = parseSession([
      { type: 'progress' as const, data: { type: 'bash_progress', output: 'running...' } },
    ]);
    assert.deepStrictEqual(blocks, []);
  });

  it('skips entries with unknown types gracefully', () => {
    const blocks = parseSession([
      { type: 'totally_unknown' } as never,
      userEntry('still works'),
    ]);
    assert.equal(blocks.length, 2); // user + cost-summary
    assert.equal(blocks[0]!.type, 'user-message');
  });

  it('skips malformed entries without crashing', () => {
    const blocks = parseSession([
      { type: 'user' } as never, // missing message field
      userEntry('after malformed'),
    ]);
    assert.equal(blocks.length, 2); // user + cost-summary
    assert.equal(blocks[0]!.type, 'user-message');
  });
});

describe('block IDs', () => {
  it('generates sequential unique IDs', () => {
    const blocks = parseSession([
      userEntry('a'),
      userEntry('b'),
      userEntry('c'),
    ]);
    const ids = blocks.map((b) => b.id);
    assert.equal(ids[0], 'block-0');
    assert.equal(ids[1], 'block-1');
    assert.equal(ids[2], 'block-2');
    // cost-summary
    assert.equal(ids[3], 'block-3');
  });
});

describe('full conversation flow', () => {
  it('parses user -> assistant -> tool_use -> result sequence', () => {
    const blocks = parseSession([
      userEntry('edit the file'),
      assistantEntry([
        { type: 'thinking', thinking: 'I need to edit...' },
        { type: 'text', text: 'I will edit the file.' },
        {
          type: 'tool_use',
          id: 'tu_full',
          name: 'Edit',
          input: { file_path: '/app.ts', old_string: 'old', new_string: 'new' },
        },
      ], { costUSD: 0.03, durationMs: 1000 }),
      resultEntry([
        { type: 'tool_result', tool_use_id: 'tu_full', content: 'Edit applied successfully' },
      ], { costUSD: 0.001 }),
      assistantEntry('Done! The file has been updated.', { costUSD: 0.01, durationMs: 500 }),
    ]);

    const types = blocks.map((b) => b.type);
    assert.deepStrictEqual(types, [
      'user-message',
      'thinking',
      'assistant-text',
      'tool-use',
      'tool-result',
      'assistant-text',
      'cost-summary',
    ]);

    // Verify tool pairing
    const toolUse = blocks.find((b) => b.type === 'tool-use');
    assert.ok(toolUse && toolUse.type === 'tool-use');
    assert.ok(toolUse.result);
    assert.equal(toolUse.result.editDiff?.filePath, '/app.ts');
    assert.equal(toolUse.result.editDiff?.oldString, 'old');
    assert.equal(toolUse.result.editDiff?.newString, 'new');

    // Verify cost summary
    const summary = blocks.find((b) => b.type === 'cost-summary');
    assert.ok(summary && summary.type === 'cost-summary');
    assert.ok(Math.abs(summary.totalCostUSD - 0.041) < 1e-9);
    assert.equal(summary.totalDurationMs, 1500);
    assert.equal(summary.messageCount, 3); // 1 user + 2 assistant
  });
});
