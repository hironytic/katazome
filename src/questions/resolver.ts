import type { QuestionDefinition } from "../types.ts";
import { askText, askNumber, askSelect } from "../interactive/prompts.ts";
import { KatazomeError } from "../errors.ts";

export interface CliAnswer {
  name: string;
  rawValue: string;
}

/**
 * Parses an array of "--answer name=value" raw strings into CliAnswer objects.
 * Throws if any entry does not contain "=".
 */
export function parseCliAnswers(rawAnswers: string[]): CliAnswer[] {
  return rawAnswers.map((raw) => {
    const eqIndex = raw.indexOf("=");
    if (eqIndex === -1) {
      throw new KatazomeError(
        `Invalid --answer value "${raw}": expected format "name=value".`
      );
    }
    return { name: raw.slice(0, eqIndex), rawValue: raw.slice(eqIndex + 1) };
  });
}

/**
 * Resolves answers for all questions by checking CLI answers first,
 * then falling back to defaults or interactive prompts.
 *
 * In non-interactive mode, a question with no CLI answer and no default is an error.
 * CLI answer validation errors always cause immediate error exit.
 */
export async function resolveAnswers(
  questions: QuestionDefinition[],
  cliAnswers: CliAnswer[],
  isInteractive: boolean,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const question of questions) {
    const cliAnswer = cliAnswers.find((a) => a.name === question.name);

    if (cliAnswer !== undefined) {
      result[question.name] = resolveFromCli(question, cliAnswer);
    } else if (!isInteractive) {
      result[question.name] = resolveNonInteractive(question);
    } else {
      result[question.name] = await resolveInteractive(question);
    }
  }

  return result;
}

function resolveFromCli(
  question: QuestionDefinition,
  cliAnswer: CliAnswer,
): unknown {
  if (question.kind === "text") {
    if (question.type === "number") {
      const n = Number(cliAnswer.rawValue);
      if (isNaN(n)) {
        throw new KatazomeError(
          `--answer ${question.name}: "${cliAnswer.rawValue}" is not a valid number.`
        );
      }
      return n;
    }
    return cliAnswer.rawValue;
  }

  // kind === "select": match by String(option.value)
  const matched = question.options.find(
    (o) => String(o.value) === cliAnswer.rawValue
  );
  if (matched === undefined) {
    const valid = question.options.map((o) => String(o.value)).join(", ");
    throw new KatazomeError(
      `--answer ${question.name}: "${cliAnswer.rawValue}" does not match any option. Valid values: ${valid}`
    );
  }
  return matched.value;
}

function resolveNonInteractive(question: QuestionDefinition): unknown {
  if ("default" in question && question.default !== undefined) {
    return question.default;
  }
  throw new KatazomeError(
    `Question "${question.name}" has no answer. Use --answer ${question.name}=<value> to supply one.`
  );
}

async function resolveInteractive(question: QuestionDefinition): Promise<unknown> {
  if (question.kind === "text") {
    const defaultValue =
      question.default !== undefined ? String(question.default) : undefined;
    if (question.type === "number") {
      const numDefault =
        question.default !== undefined ? Number(question.default) : undefined;
      return askNumber(question.message, numDefault);
    }
    return askText(question.message, defaultValue);
  }

  // kind === "select"
  const defaultIndex =
    question.default !== undefined
      ? question.options.findIndex(
          (o) => String(o.value) === String(question.default)
        )
      : undefined;

  return askSelect(
    question.message,
    question.options,
    defaultIndex !== undefined && defaultIndex >= 0 ? defaultIndex : undefined,
  );
}
