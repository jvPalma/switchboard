import type {
  JsonlEntry,
  UserEntry,
  AssistantEntry,
  ResultEntry,
  SystemEntry,
  LegacyMessageEntry,
  ContentBlock,
  ToolResultBlock,
} from '@shared/types/jsonl';

import type {
  ChatBlock,
  AssistantTextBlock,
  ToolUseBlockData,
  ToolResultBlockData,
  ImageData,
  SystemBlock,
  UserMessageBlock,
} from './types';

interface UsageData {
  input_tokens?: number;
  output_tokens?: number;
}

interface CostAccumulator {
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  messageCount: number;
}

export function parseSession(entries: JsonlEntry[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  const pendingToolUses = new Map<string, ToolUseBlockData>();
  let blockIndex = 0;
  const nextId = () => `block-${blockIndex++}`;

  const costs: CostAccumulator = {
    totalCostUSD: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalDurationMs: 0,
    messageCount: 0,
  };

  for (const entry of entries) {
    try {
      processEntry(entry, blocks, pendingToolUses, nextId, costs);
    } catch {
      // Skip malformed entries gracefully
    }
  }

  if (costs.messageCount > 0) {
    blocks.push({
      type: 'cost-summary',
      id: nextId(),
      ...costs,
    });
  }

  return blocks;
}

function processEntry(
  entry: JsonlEntry,
  blocks: ChatBlock[],
  pendingToolUses: Map<string, ToolUseBlockData>,
  nextId: () => string,
  costs: CostAccumulator,
): void {
  switch (entry.type) {
    case 'user': {
      const userBlock = buildUserBlock(entry, nextId);
      // Deduplicate: Claude Code writes a user entry for every API call,
      // so the same human prompt repeats for each tool-use round.
      // Only show it if the text changed from the last user block.
      const lastUser = findLastUserBlock(blocks);
      if (!lastUser || lastUser.text !== userBlock.text) {
        blocks.push(userBlock);
        costs.messageCount++;
      }
      break;
    }
    case 'assistant':
      processAssistant(entry, blocks, pendingToolUses, nextId, costs);
      break;
    case 'result':
      processResult(entry, blocks, pendingToolUses, nextId, costs);
      break;
    case 'system':
      blocks.push(buildSystemBlock(entry, nextId));
      break;
    case 'message':
      processLegacy(entry, blocks, pendingToolUses, nextId, costs);
      break;
    default:
      break;
  }
}

function findLastUserBlock(blocks: ChatBlock[]): UserMessageBlock | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i]!.type === 'user-message') return blocks[i] as UserMessageBlock;
  }
  return null;
}

function extractUserContent(content: string | ContentBlock[]): { text: string; images: ImageData[] } {
  if (typeof content === 'string') return { text: content, images: [] };

  const textParts: string[] = [];
  const images: ImageData[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    } else if (block.type === 'image') {
      images.push({ mediaType: block.source.media_type, base64: block.source.data });
    }
  }

  return { text: textParts.join('\n'), images };
}

function buildUserBlock(entry: UserEntry, nextId: () => string): UserMessageBlock {
  const { text, images } = extractUserContent(entry.message.content);
  return { type: 'user-message', id: nextId(), text, images, timestamp: entry.timestamp };
}

function getUsage(entry: AssistantEntry | ResultEntry): UsageData | undefined {
  const messageAny = entry.message as unknown as Record<string, unknown>;
  const entryAny = entry as unknown as Record<string, unknown>;
  return (messageAny.usage ?? entryAny.usage) as UsageData | undefined;
}

function processAssistant(
  entry: AssistantEntry,
  blocks: ChatBlock[],
  pendingToolUses: Map<string, ToolUseBlockData>,
  nextId: () => string,
  costs: CostAccumulator,
): void {
  const { content } = entry.message;
  const usage = getUsage(entry);

  if (entry.costUSD) costs.totalCostUSD += entry.costUSD;
  if (entry.durationMs) costs.totalDurationMs += entry.durationMs;
  if (usage?.input_tokens) costs.totalInputTokens += usage.input_tokens;
  if (usage?.output_tokens) costs.totalOutputTokens += usage.output_tokens;
  costs.messageCount++;

  if (typeof content === 'string') {
    if (content.trim()) {
      blocks.push(buildAssistantTextBlock(nextId(), content, entry, usage));
    }
    return;
  }

  for (const block of content) {
    switch (block.type) {
      case 'text':
        if (block.text.trim()) {
          blocks.push(buildAssistantTextBlock(nextId(), block.text, entry, usage));
        }
        break;
      case 'thinking':
        blocks.push({ type: 'thinking', id: nextId(), text: block.thinking });
        break;
      case 'tool_use': {
        const toolBlock: ToolUseBlockData = {
          type: 'tool-use',
          id: nextId(),
          toolUseId: block.id,
          toolName: block.name,
          input: block.input,
        };
        blocks.push(toolBlock);
        pendingToolUses.set(block.id, toolBlock);
        break;
      }
      case 'image':
        blocks.push({
          type: 'image',
          id: nextId(),
          mediaType: block.source.media_type,
          base64: block.source.data,
        });
        break;
      default:
        break;
    }
  }
}

function buildAssistantTextBlock(
  id: string,
  text: string,
  entry: AssistantEntry,
  usage: UsageData | undefined,
): AssistantTextBlock {
  return {
    type: 'assistant-text',
    id,
    text,
    costUSD: entry.costUSD,
    durationMs: entry.durationMs,
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
  };
}

function processResult(
  entry: ResultEntry,
  blocks: ChatBlock[],
  pendingToolUses: Map<string, ToolUseBlockData>,
  nextId: () => string,
  costs: CostAccumulator,
): void {
  if (entry.costUSD) costs.totalCostUSD += entry.costUSD;

  const { content } = entry.message;
  if (typeof content === 'string') return;

  const usage = getUsage(entry);
  if (usage?.input_tokens) costs.totalInputTokens += usage.input_tokens;
  if (usage?.output_tokens) costs.totalOutputTokens += usage.output_tokens;

  for (const block of content) {
    if (block.type !== 'tool_result') continue;

    const pending = pendingToolUses.get(block.tool_use_id);
    const toolName = pending?.toolName ?? 'unknown';
    const input = pending?.input ?? {};
    const resultContent = extractResultContent(block);

    const resultBlock: ToolResultBlockData = {
      type: 'tool-result',
      id: nextId(),
      toolUseId: block.tool_use_id,
      toolName,
      content: resultContent,
      isError: block.is_error ?? false,
    };

    if (isEditTool(toolName) && typeof input.file_path === 'string') {
      resultBlock.editDiff = {
        filePath: input.file_path,
        oldString: String(input.old_string ?? ''),
        newString: String(input.new_string ?? ''),
      };
    }

    if (isFilePathTool(toolName) && typeof input.file_path === 'string') {
      resultBlock.filePath = input.file_path;
    }

    blocks.push(resultBlock);

    if (pending) {
      pending.result = resultBlock;
      pendingToolUses.delete(block.tool_use_id);
    }

    if (block.is_error) {
      blocks.push({
        type: 'error',
        id: nextId(),
        message: `Tool error: ${toolName}`,
        details: resultContent,
      });
    }
  }
}

function extractResultContent(block: ToolResultBlock): string {
  if (block.output) return block.output;
  if (typeof block.content === 'string') return block.content;
  return block.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

function isEditTool(name: string): boolean {
  return name === 'Edit' || name === 'edit' || name === 'str_replace_editor';
}

function isFilePathTool(name: string): boolean {
  return name === 'Read' || name === 'Write' || name === 'read' || name === 'write';
}

function buildSystemBlock(entry: SystemEntry, nextId: () => string): SystemBlock {
  return { type: 'system', id: nextId(), text: entry.content ?? '', subtype: entry.subtype };
}

function processLegacy(
  entry: LegacyMessageEntry,
  blocks: ChatBlock[],
  pendingToolUses: Map<string, ToolUseBlockData>,
  nextId: () => string,
  costs: CostAccumulator,
): void {
  const content = entry.message?.content ?? entry.content;
  if (!content) return;

  if (entry.role === 'user') {
    if (entry.costUSD) costs.totalCostUSD += entry.costUSD;
    const { text, images } = extractUserContent(content);
    blocks.push({ type: 'user-message', id: nextId(), text, images, timestamp: entry.timestamp });
    costs.messageCount++;
  } else if (entry.role === 'assistant') {
    processAssistant(
      { type: 'assistant', message: { role: 'assistant', content }, costUSD: entry.costUSD },
      blocks,
      pendingToolUses,
      nextId,
      costs,
    );
  }
}
