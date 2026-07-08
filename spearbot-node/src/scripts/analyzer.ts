import "dotenv/config";
import * as fs from "fs";
import { VectorDBQAChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings";
import { OpenAI } from "langchain/llms";
import { HNSWLib } from "langchain/vectorstores";
import { CliError, parsePositiveInteger, readFlagValue, runCli } from "../lib/cli";
import { getDefaultVectorStorePath, getOpenAiModel, isDirectCliEntry } from "../lib/paths";

export interface AnalyzerOptions {
  question: string;
  indexPath: string;
  k: number;
}

export function getAnalyzerUsage(): string {
  return `
spear-analyze

Queries a local HNSW vector store built from Spearbot summaries.

Usage:
  ./analyzer.sh [--index <path>] [--k <count>] "What access control mechanisms are in place?"

Options:
  --index <path>  HNSW index directory. Defaults to spearbot-node/vecstore/embeddings.
  --k <count>     Number of nearest chunks to retrieve. Defaults to 5.
`;
}

export function parseAnalyzerArgs(
  args: string[],
  cwd: string = process.cwd(),
  validatePaths = true
): AnalyzerOptions {
  const options: AnalyzerOptions = {
    question: "",
    indexPath: getDefaultVectorStorePath(cwd),
    k: 5
  };
  const questionParts: string[] = [];

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
      case "--k":
        options.k = parsePositiveInteger(readFlagValue(args, i, arg), arg);
        i++;
        break;
      default:
        questionParts.push(arg);
    }
  }

  options.question = questionParts.join(" ").trim();

  if (!options.question) {
    throw new CliError("Question not specified");
  }

  if (validatePaths && !fs.existsSync(options.indexPath)) {
    throw new CliError(`Vector index ${options.indexPath} does not exist. Run ./embedder.sh first.`);
  }

  return options;
}

export async function askQuestion(
  options: AnalyzerOptions,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY env not set. Exiting...");
  }

  const vectorStore = await HNSWLib.load(options.indexPath, new OpenAIEmbeddings());
  const model = new OpenAI({ temperature: 0, modelName: getOpenAiModel(env) });
  const vectorChain = VectorDBQAChain.fromLLM(model, vectorStore, {
    k: options.k,
    returnSourceDocuments: true
  });
  const result = await vectorChain.call({ query: options.question });

  return String(result.text);
}

export async function main(args: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  try {
    const options = parseAnalyzerArgs(args);
    console.log(await askQuestion(options, env));
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      if (error.message) {
        console.error(error.message);
      }
      if (error.showUsage) {
        console.log(getAnalyzerUsage());
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
