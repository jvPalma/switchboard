import fs from 'fs';
import path from 'path';

/**
 * Compute the effective mtime for a session folder by checking both
 * the directory mtime and the mtime of each .jsonl file within it.
 * Session files are appended in place, which updates the file mtime
 * but often leaves the containing directory mtime unchanged.
 */
export const getFolderIndexMtimeMs = (folderPath: string): number => {
  let indexMtimeMs = 0;

  try {
    indexMtimeMs = fs.statSync(folderPath).mtimeMs;
  } catch {
    return 0;
  }

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      try {
        const fileMtimeMs = fs.statSync(path.join(folderPath, entry.name)).mtimeMs;
        if (fileMtimeMs > indexMtimeMs) indexMtimeMs = fileMtimeMs;
      } catch { /* ignore individual file stat errors */ }
    }
  } catch { /* ignore readdir errors */ }

  return indexMtimeMs;
};
