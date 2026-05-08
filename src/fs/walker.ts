import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface FileEntry {
  /** Absolute path to the file. */
  absolutePath: string;
  /** Path relative to the root directory (no leading slash). */
  relativePath: string;
}

/**
 * Recursively walks a directory and returns all files (not directories).
 *
 * @param dirPath  Absolute path to the directory to walk.
 * @returns        All files found, with their absolute and relative paths.
 */
export function walkDirectory(dirPath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  walkRecursive(dirPath, "", entries);
  return entries;
}

function walkRecursive(rootPath: string, relativeDir: string, entries: FileEntry[]): void {
  const currentPath = relativeDir === "" ? rootPath : join(rootPath, relativeDir);
  const names = readdirSync(currentPath);

  for (const name of names) {
    const relPath = relativeDir === "" ? name : `${relativeDir}/${name}`;
    const absPath = join(rootPath, relPath);
    const stat = statSync(absPath);

    if (stat.isDirectory()) {
      walkRecursive(rootPath, relPath, entries);
    } else if (stat.isFile()) {
      entries.push({ absolutePath: absPath, relativePath: relPath });
    }
  }
}
