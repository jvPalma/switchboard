// Shared pure utility functions used across main and renderer.

/**
 * Convert a Claude projects folder name to a short display path.
 * e.g. "-Users-home-dev-MyClaude" → "dev/MyClaude"
 */
export const folderToShortPath = (folder: string): string => {
  const parts = folder.replace(/^-/, '').split('-');
  const meaningful = parts.filter(Boolean);
  return meaningful.slice(-2).join('/');
};

/**
 * Convert a project path to its corresponding folder name
 * in ~/.claude/projects/.
 */
export const projectPathToFolder = (projectPath: string): string =>
  projectPath.replace(/[/_]/g, '-').replace(/^-/, '-');
