import { resolve, join, basename } from "node:path";
import { writeFileSync, statSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadSetting } from "../config/loader.ts";
import { detranspile } from "../core/detranspiler.ts";
import {
  getTagDefForExtension,
  getExtension,
  ensureDir,
} from "./utils.ts";
import { KatazomeError } from "../errors.ts";
import { readSession, checkSessionVersion } from "../session.ts";

export interface DetranspileOptions {
  sessionPath: string;
  outputPath?: string;
  force?: boolean;
}

async function askConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

/**
 * Runs the `detranspile` command: converts transpilate file(s) back to template(s)
 * using a transpile session file.
 */
export async function runDetranspile(options: DetranspileOptions): Promise<void> {
  const inputAbs = resolve(options.sessionPath);
  const isDirectory = existsSync(inputAbs) && statSync(inputAbs).isDirectory();
  const sessionFilePath = isDirectory
    ? join(inputAbs, "ktzm-session.json")
    : inputAbs;

  const session = await readSession(sessionFilePath);
  checkSessionVersion(session);

  const setting = await loadSetting(session.settingFile);

  const outputAbs = options.outputPath
    ? resolve(options.outputPath)
    : session.templatePath;

  if (outputAbs === session.templatePath && !options.force) {
    const confirmed = await askConfirmation(
      `This will overwrite the original template at "${outputAbs}". Continue?`
    );
    if (!confirmed) {
      process.stderr.write("Aborted.\n");
      return;
    }
  }

  for (const sessionFile of session.files) {
    let transpilateAbsPath: string;
    let templateOutAbsPath: string;
    let displayName: string;

    if (sessionFile.relativePath === "") {
      // Single file mode
      transpilateAbsPath = session.transpilatePath;
      templateOutAbsPath = outputAbs;
      displayName = basename(session.transpilatePath);
    } else {
      // Directory mode
      transpilateAbsPath = join(
        session.transpilatePath,
        `${sessionFile.relativePath}.ts`
      );
      templateOutAbsPath = join(outputAbs, sessionFile.relativePath);
      displayName = sessionFile.relativePath;
    }

    await detranspileFile(transpilateAbsPath, templateOutAbsPath, setting, displayName);
  }
}

async function detranspileFile(
  transpilatePath: string,
  outputPath: string,
  setting: ReturnType<typeof loadSetting> extends Promise<infer T> ? T : never,
  displayName: string
): Promise<void> {
  // The extension of the original template is the transpilate name without ".ts".
  // e.g. "main.c.ts" → original ext is "c"
  const nameWithoutTs = displayName.endsWith(".ts")
    ? displayName.slice(0, -3)
    : displayName;

  const ext = getExtension(nameWithoutTs);
  if (ext === undefined) {
    throw new KatazomeError(
      `Cannot determine original extension from transpiled file name "${displayName}".`
    );
  }

  const tagDef = getTagDefForExtension(setting, ext);

  let transpilateContent: string;
  try {
    transpilateContent = await Bun.file(transpilatePath).text();
  } catch {
    throw new KatazomeError(`Cannot read transpiled file: "${transpilatePath}"`);
  }

  const template = detranspile(transpilateContent, tagDef);

  ensureDir(outputPath);
  writeFileSync(outputPath, template, "utf-8");
}
