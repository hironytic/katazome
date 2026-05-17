import { resolve, join, basename } from "node:path";
import { writeFileSync, statSync, existsSync, readFileSync } from "node:fs";
import { loadSetting } from "../config/loader.ts";
import { detranspile } from "../core/detranspiler.ts";
import {
  getTagDefForFile,
  askConfirmation,
  ensureDir,
} from "./utils.ts";
import { KatazomeError } from "../errors.ts";
import { readSession, checkSessionVersion } from "../session.ts";

export interface DetranspileOptions {
  sessionPath: string;
  outputPath?: string;
  force?: boolean;
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
        `${sessionFile.relativePath}.mts`
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
  // The original template filename is the transpilate name without ".mts".
  // e.g. "main.c.mts" → original filename is "main.c"
  const originalFilename = displayName.endsWith(".mts")
    ? displayName.slice(0, -4)
    : displayName;

  const tagDef = getTagDefForFile(setting, originalFilename);

  let transpilateContent: string;
  try {
    transpilateContent = readFileSync(transpilatePath, "utf-8");
  } catch {
    throw new KatazomeError(`Cannot read transpiled file: "${transpilatePath}"`);
  }

  const template = detranspile(transpilateContent, tagDef);

  ensureDir(outputPath);
  writeFileSync(outputPath, template, "utf-8");
}
