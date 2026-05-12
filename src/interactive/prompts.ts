import { createInterface } from "node:readline";

function createRl() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

/**
 * Prompts the user to select one item from a numbered list.
 *
 * Display example (defaultIndex = 0):
 *   Message:
 *     1) Option A
 *     2) Option B
 *   Enter number [1]:
 *
 * If defaultIndex is provided, pressing Enter with no input selects that option.
 * Otherwise, empty input re-prompts.
 */
export async function askSelect(
  message: string,
  options: { label: string; value: unknown }[],
  defaultIndex?: number,
): Promise<unknown> {
  const defaultDisplay =
    defaultIndex !== undefined ? ` [${defaultIndex + 1}]` : "";

  const optionLines = options
    .map((o, i) => `  ${i + 1}) ${o.label}`)
    .join("\n");

  const promptLine = `Enter number (1-${options.length})${defaultDisplay}: `;

  const resolvedDefaultIndex = defaultIndex;
  return new Promise((resolve) => {
    const ask = () => {
      process.stdout.write(`${message}\n${optionLines}\n`);
      const rl = createRl();
      rl.question(promptLine, (answer) => {
        rl.close();
        const trimmed = answer.trim();
        if (trimmed === "" && resolvedDefaultIndex !== undefined) {
          process.stdout.write("\n");
          resolve(options[resolvedDefaultIndex]!.value);
          return;
        }
        const n = parseInt(trimmed, 10);
        if (!isNaN(n) && n >= 1 && n <= options.length) {
          process.stdout.write("\n");
          resolve(options[n - 1]!.value);
          return;
        }
        process.stderr.write(`Please enter a number between 1 and ${options.length}.\n\n`);
        ask();
      });
    };
    ask();
  });
}

/**
 * Prompts the user to enter a string.
 * If no default is set and the user enters nothing, re-prompts.
 *
 * Display example (defaultValue = "foo"):
 *   Message (foo):
 */
export async function askText(
  message: string,
  defaultValue?: string,
): Promise<string> {
  const defaultDisplay =
    defaultValue !== undefined ? ` (${defaultValue})` : "";
  const promptLine = `${message}${defaultDisplay}: `;

  return new Promise((resolve) => {
    const ask = () => {
      const rl = createRl();
      rl.question(promptLine, (answer) => {
        rl.close();
        const trimmed = answer.trim();
        if (trimmed === "") {
          if (defaultValue !== undefined) {
            process.stdout.write("\n");
            resolve(defaultValue);
          } else {
            process.stderr.write("This field is required.\n\n");
            ask();
          }
          return;
        }
        process.stdout.write("\n");
        resolve(trimmed);
      });
    };
    ask();
  });
}

/**
 * Prompts the user to enter a number.
 * Re-prompts if the input is empty without a default, or is not a valid number.
 *
 * Display example (defaultValue = 3):
 *   Message (3):
 */
export async function askNumber(
  message: string,
  defaultValue?: number,
): Promise<number> {
  const defaultDisplay =
    defaultValue !== undefined ? ` (${defaultValue})` : "";
  const promptLine = `${message}${defaultDisplay}: `;

  return new Promise((resolve) => {
    const ask = () => {
      const rl = createRl();
      rl.question(promptLine, (answer) => {
        rl.close();
        const trimmed = answer.trim();
        if (trimmed === "") {
          if (defaultValue !== undefined) {
            process.stdout.write("\n");
            resolve(defaultValue);
          } else {
            process.stderr.write("This field is required.\n\n");
            ask();
          }
          return;
        }
        const n = Number(trimmed);
        if (!isNaN(n)) {
          process.stdout.write("\n");
          resolve(n);
          return;
        }
        process.stderr.write(`"${trimmed}" is not a valid number.\n\n`);
        ask();
      });
    };
    ask();
  });
}
