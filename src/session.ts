import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { KatazomeError } from "./errors.ts";
import { CLI_VERSION } from "./version.ts";

export interface TranspileSessionFile {
  relativePath: string;
}

export interface TranspileSession {
  version: string;
  settingFile: string;
  templatePath: string;
  transpilatePath: string;
  files: TranspileSessionFile[];
}

export function writeSession(sessionPath: string, session: TranspileSession): void {
  mkdirSync(dirname(resolve(sessionPath)), { recursive: true });
  writeFileSync(sessionPath, JSON.stringify(session, null, 2), "utf-8");
}

export async function readSession(sessionPath: string): Promise<TranspileSession> {
  const absPath = resolve(sessionPath);
  if (!existsSync(absPath)) {
    throw new KatazomeError(`Session file not found: "${absPath}"`);
  }

  let content: string;
  try {
    content = await Bun.file(absPath).text();
  } catch {
    throw new KatazomeError(`Cannot read session file: "${absPath}"`);
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new KatazomeError(`Cannot parse session file: "${absPath}"`);
  }

  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as Record<string, unknown>).version !== "string" ||
    typeof (data as Record<string, unknown>).settingFile !== "string" ||
    typeof (data as Record<string, unknown>).templatePath !== "string" ||
    typeof (data as Record<string, unknown>).transpilatePath !== "string" ||
    !Array.isArray((data as Record<string, unknown>).files) ||
    !(data as { files: unknown[] }).files.every(
      (f) =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as Record<string, unknown>).relativePath === "string"
    )
  ) {
    throw new KatazomeError(`Invalid session file format: "${absPath}"`);
  }

  return data as TranspileSession;
}

export function checkSessionVersion(session: TranspileSession): void {
  if (session.version !== CLI_VERSION) {
    throw new KatazomeError(
      `Session was created with version ${session.version}, but current version is ${CLI_VERSION}. Please run transpile again.`
    );
  }
}
