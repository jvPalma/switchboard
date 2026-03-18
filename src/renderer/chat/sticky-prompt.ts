// Sticky bottom prompt for the chat view — sends user messages to the active PTY.

import { activeSessionId, activePtyIds } from '../state';

// ── State ─────────────────────────────────────────────────────────────

let textareaEl: HTMLTextAreaElement | null = null;
let sendBtnEl: HTMLButtonElement | null = null;
let newMsgsBtnEl: HTMLElement | null = null;
let scrollRef: HTMLElement | null = null;
let userAtBottom = true;
let newMsgsVisible = false;

const SCROLL_THRESHOLD = 50;
const MAX_TEXTAREA_HEIGHT = 150;

// ── Public API ────────────────────────────────────────────────────────

export const createStickyPrompt = (): HTMLElement => {
  const wrap = document.createElement('div');
  wrap.className = 'chat-sticky-prompt';

  // New messages floating pill (positioned above via CSS)
  const newMsgsBtn = document.createElement('button');
  newMsgsBtn.className = 'chat-new-msgs-btn hidden';
  newMsgsBtn.textContent = '\u2193 New messages';
  newMsgsBtn.addEventListener('click', () => {
    scrollToBottom();
    hideNewMsgsBtn();
  });
  wrap.appendChild(newMsgsBtn);

  // Input row: textarea + send button
  const row = document.createElement('div');
  row.className = 'chat-prompt-row';

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-prompt-textarea';
  textarea.placeholder = 'No active session';
  textarea.disabled = true;
  textarea.rows = 1;
  textarea.addEventListener('keydown', handleKeydown);
  textarea.addEventListener('input', autoGrow);
  row.appendChild(textarea);

  const sendBtn = document.createElement('button');
  sendBtn.className = 'chat-prompt-send';
  sendBtn.textContent = '\u21B5';
  sendBtn.title = 'Send (Enter)';
  sendBtn.disabled = true;
  sendBtn.addEventListener('click', sendMessage);
  row.appendChild(sendBtn);

  wrap.appendChild(row);

  textareaEl = textarea;
  sendBtnEl = sendBtn;
  newMsgsBtnEl = newMsgsBtn;

  return wrap;
};

export const updatePromptState = (sessionId: string | null, isRunning: boolean): void => {
  if (!textareaEl || !sendBtnEl) return;
  if (!sessionId) {
    textareaEl.placeholder = 'No active session';
    textareaEl.disabled = true;
    sendBtnEl.disabled = true;
  } else if (isRunning) {
    textareaEl.placeholder = 'Type a message\u2026  (Enter to send)';
    textareaEl.disabled = false;
    sendBtnEl.disabled = false;
  } else {
    textareaEl.placeholder = 'This session is read-only';
    textareaEl.disabled = true;
    sendBtnEl.disabled = true;
  }
};

export const focusPrompt = (): void => {
  if (textareaEl && !textareaEl.disabled) {
    textareaEl.focus();
  }
};

export const bindScrollContainer = (el: HTMLElement): void => {
  scrollRef = el;
  userAtBottom = true;
  hideNewMsgsBtn();
  el.addEventListener('scroll', () => {
    userAtBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD;
    if (userAtBottom) hideNewMsgsBtn();
  });
};

export const notifyNewBlocks = (): void => {
  if (!userAtBottom && scrollRef) showNewMsgsBtn();
};

// ── Internal ──────────────────────────────────────────────────────────

const handleKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    sendMessage();
  }
};

const sendMessage = (): void => {
  if (!textareaEl || textareaEl.disabled) return;
  const text = textareaEl.value.trim();
  if (!text) return;
  const sessionId = activeSessionId;
  if (!sessionId || !activePtyIds.has(sessionId)) return;

  window.api.sendInput(sessionId, text + '\n');
  textareaEl.value = '';
  resetHeight();
};

const autoGrow = (): void => {
  if (!textareaEl) return;
  textareaEl.style.height = 'auto';
  textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
};

const resetHeight = (): void => {
  if (!textareaEl) return;
  textareaEl.style.height = 'auto';
};

const scrollToBottom = (): void => {
  if (!scrollRef) return;
  scrollRef.scrollTop = scrollRef.scrollHeight;
  userAtBottom = true;
};

const showNewMsgsBtn = (): void => {
  if (newMsgsVisible || !newMsgsBtnEl) return;
  newMsgsVisible = true;
  newMsgsBtnEl.classList.remove('hidden');
};

const hideNewMsgsBtn = (): void => {
  if (!newMsgsVisible || !newMsgsBtnEl) return;
  newMsgsVisible = false;
  newMsgsBtnEl.classList.add('hidden');
};
