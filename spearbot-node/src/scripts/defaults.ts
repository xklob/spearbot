import * as fs from "fs";
import { AnalyzerOptions, askQuestion } from "./analyzer";
import { CliError, readFlagValue, runCli } from "../lib/cli";
import { getDefaultVectorStorePath, isDirectCliEntry } from "../lib/paths";

export interface DefaultQuestionResult {
  question: string;
  answer: string;
}

export interface DefaultQuestionOptions {
  indexPath: string;
  out: string;
}

export const defaultQuestions: string[] = [
  "Give a bullet point overview of the system.",
  "What access control mechanisms are in place?",
  "For each smart contract, give a bullet point overview.",
  "What modifiers are used in each contract?"
];

export function getDefaultsUsage(): string {
  return `
spear-defaults

Runs a small default question set against the local vector index.

Usage:
  ./run-default-questions.sh [--index <path>] [--out <path>]

Options:
  --index <path>  HNSW index directory. Defaults to spearbot-node/vecstore/embeddings.
  --out <path>    Markdown output path. Defaults to defaultQuestions.md.
`;
}

export function parseDefaultQuestionArgs(
  args: string[],
  cwd: string = process.cwd(),
  validatePaths = true
): DefaultQuestionOptions {
  const options: DefaultQuestionOptions = {
    indexPath: getDefaultVectorStorePath(cwd),
    out: "defaultQuestions.md"
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--help":
      case "-h":
        throw new CliError("", 0);
      case "--index":
        options.indexPath = readFlagValue(args, i, arg);
        i++;
        break;
      case "--out":
        options.out = readFlagValue(args, i, arg);
        i++;
        break;
      default:
        throw new CliError(`Invalid argument "${arg}"`);
    }
  }

  if (validatePaths && !fs.existsSync(options.indexPath)) {
    throw new CliError(`Vector index ${options.indexPath} does not exist. Run ./embedder.sh first.`);
  }

  return options;
}

export async function answerDefaultQuestions(
  options: DefaultQuestionOptions,
  questions: string[] = defaultQuestions,
  env: NodeJS.ProcessEnv = process.env
): Promise<DefaultQuestionResult[]> {
  const results: DefaultQuestionResult[] = [];

  for (const question of questions) {
    console.log(`Question: ${question}`);
    const analyzerOptions: AnalyzerOptions = {
      question,
      indexPath: options.indexPath,
      k: 10
    };
    results.push({
      question,
      answer: await askQuestion(analyzerOptions, env)
    });
  }

  return results;
}

export function answersToMarkdown(results: DefaultQuestionResult[]): string {
  return results.map((result, index) => [
    `${index + 1}. ${result.question}`,
    "",
    "```",
    result.answer,
    "```"
  ].join("\n")).join("\n\n") + "\n";
}

export async function main(args: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  try {
    const options = parseDefaultQuestionArgs(args);
    const results = await answerDefaultQuestions(options, defaultQuestions, env);
    fs.writeFileSync(options.out, answersToMarkdown(results));
    console.log(`Wrote ${results.length} questions and answers to ${options.out}`);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      if (error.message) {
        console.error(error.message);
      }
      if (error.showUsage) {
        console.log(getDefaultsUsage());
      }
      return error.exitCode;
    }

    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (isDirectCliEntry(import.meta.url)) {
  void runCli(() => main());
}
