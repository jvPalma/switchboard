export const formatDate = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const escapeHtml = (str: string): string => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

export const cleanDisplayName = (name: string | null): string => {
  if (!name) return '';
  const prefix = 'Implement the following plan:';
  if (name.startsWith(prefix)) return name.slice(prefix.length).trim();
  return name;
};

export const flashButtonText = (btn: HTMLElement, text: string, duration = 1200): void => {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; }, duration);
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return ms + 'ms';
  const s = (ms / 1000).toFixed(1);
  return s + 's';
};

export const basename = (filePath: string): string => {
  if (!filePath) return 'untitled';
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'untitled';
};
