// Ambient type declarations for browser globals loaded via script tags in index.html

// xterm.js (loaded from node_modules/@xterm/xterm)
declare class Terminal {
  constructor(options?: Record<string, unknown>);
  cols: number;
  rows: number;
  buffer: { active: { viewportY: number; baseY: number } };
  options: Record<string, unknown>;
  open(container: HTMLElement): void;
  write(data: string, callback?: () => void): void;
  dispose(): void;
  focus(): void;
  scrollToBottom(): void;
  onData(handler: (data: string) => void): void;
  onResize(handler: (size: { cols: number; rows: number }) => void): void;
  onTitleChange(handler: (title: string) => void): void;
  onBell(handler: () => void): void;
  loadAddon(addon: unknown): void;
  attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean): void;
}

// @xterm/addon-fit
declare namespace FitAddon {
  class FitAddon {
    fit(): void;
  }
}

// @xterm/addon-web-links
declare namespace WebLinksAddon {
  class WebLinksAddon {
    constructor(handler?: (event: MouseEvent, url: string) => void);
  }
}

// morphdom (loaded from node_modules/morphdom/dist/morphdom-umd.js)
interface MorphdomOptions {
  childrenOnly?: boolean;
  onBeforeElUpdated?: (fromEl: HTMLElement, toEl: HTMLElement) => boolean;
  getNodeKey?: (node: HTMLElement) => string | undefined;
}

interface Morphdom {
  (fromNode: HTMLElement, toNode: HTMLElement | string, options?: MorphdomOptions): void;
}

// CodeMirror bundle (loaded from codemirror-bundle.js)
interface CodeMirrorEditorView {
  state: { doc: { length: number; toString(): string } };
  dom: HTMLElement;
  dispatch(tr: { changes?: { from: number; to: number; insert: string } }): void;
  destroy(): void;
}

interface CodeMirrorMergeView {
  dom: HTMLElement;
  b?: { state: { doc: { toString(): string } } };
  state?: { doc: { toString(): string } };
  destroy(): void;
}

interface CodeMirrorSetup {
  createPlanEditor(container: HTMLElement): CodeMirrorEditorView;
  createReadOnlyViewer(container: HTMLElement, content: string, filePath: string): CodeMirrorEditorView;
  createMergeViewer(container: HTMLElement, oldContent: string, newContent: string, filePath: string): CodeMirrorMergeView;
  createUnifiedMergeViewer(container: HTMLElement, oldContent: string, newContent: string, filePath: string): CodeMirrorEditorView;
}

// Extend Window for globals
interface Window {
  api: import('./api/types').SwitchboardApi;
  morphdom: Morphdom;
  createPlanEditor: CodeMirrorSetup['createPlanEditor'];
  createReadOnlyViewer: CodeMirrorSetup['createReadOnlyViewer'];
  createMergeViewer: CodeMirrorSetup['createMergeViewer'];
  createUnifiedMergeViewer: CodeMirrorSetup['createUnifiedMergeViewer'];
  CodeMirrorSetup?: CodeMirrorSetup;
  CMMergeView?: unknown;
}
