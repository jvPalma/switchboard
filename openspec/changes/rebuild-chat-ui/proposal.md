## Summary

Rebuild Switchboard from a terminal-centric session viewer into a rich chat-based IDE that replicates and extends Claude Code's TUI interface. The work is split into three phases:

1. **TypeScript Migration** — Convert the ~11K-line plain JS codebase to TypeScript with a modular folder structure, shared types, and proper build tooling.
2. **Chat Renderer** — Build a structured chat view that parses `.jsonl` session data in real-time, rendering every element Claude Code's TUI shows: user/assistant messages, tool calls (Read/Write/Edit/Bash/etc.), code diffs, file contents, loading spinners, cost/token counts, permission prompts, and thinking blocks.
3. **Enhanced UX** — Extend beyond the terminal with clickable file references that open in-panel, inline image viewing, a sticky bottom prompt that stays visible while scrolling, and rendered Markdown (with diff support) instead of raw text.

## Motivation

Today, Switchboard shows sessions as raw xterm.js terminals — opaque character grids with no structured data. Users cannot click files, preview images, copy code blocks, or interact with the conversation meaningfully. The `.jsonl` session files already contain rich structured data (messages, tool calls, file contents, diffs) that is completely unused by the UI.

## Scope

- **In scope:** TypeScript conversion, modular architecture, chat message renderer, real-time `.jsonl` tailing, all Claude Code TUI elements, file/image preview, sticky prompt, Markdown rendering
- **Out of scope:** Multi-user auth, remote deployment, mobile layout, new AI features, changes to Claude CLI itself
