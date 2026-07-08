import "dotenv/config";
import * as fs from "fs";
import { Document } from "langchain/document";
import { OpenAIChat } from "langchain/llms";
import { OpenAIEmbeddings } from "langchain/embeddings";
import { HNSWLib } from "langchain/vectorstores";
import { CliError, readFlagValue, runCli } from "../lib/cli";
import { getDefaultVectorStorePath, getOpenAiModel, isDirectCliEntry } from "../lib/paths";
import { SingleFileSummary, Summaries } from "../types/types";

export enum EmbedderInputFormat {
  Json = "json",
  Text = "text"
}

export enum EmbedderOutputFormat {
  Pinecone = "pinecone",
  HNSWIndex = "hnsw",
  Both = "both"
}

export interface EmbedderOptions {
  inputFile: string;
  inputFormat: EmbedderInputFormat;
  outputFormat: EmbedderOutputFormat;
  outputDir: string;
}

export interface EmbeddingDocuments {
  texts: string[];
  docs: Document[];
}

export function getEmbedderUsage(): string {
  return `
spear-emb

Creates embeddings over a summarization JSON file and saves a local HNSW index.

Usage:
  ./embedder.sh --in <path> --fmt <json|text> --out <hnsw|pinecone|both> --outdir <path>

Options:
  --in <path>      Path to summarization JSON. Required.
  --fmt <format>   Input format. Only json is currently supported.
  --out <format>   Output target. hnsw is supported; pinecone and both fail clearly.
  --outdir <path>  HNSW output directory. Defaults to spearbot-node/vecstore/embeddings.
`;
}

export function parseEmbedderArgs(
  args: string[],
  cwd: string = process.cwd(),
  validatePaths = true
): EmbedderOptions {
  const options: EmbedderOptions = {
    inputFile: "",
    inputFormat: EmbedderInputFormat.Json,
    outputFormat: EmbedderOutputFormat.HNSWIndex,
    outputDir: getDefaultVectorStorePath(cwd)
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--help":
      case "-h":
        throw new CliError("", 0);
      case "--in":
        options.inputFile = readFlagValue(args, i, arg);
        i++;
        break;
      case "--fmt":
        options.inputFormat = parseInputFormat(readFlagValue(args, i, arg));
        i++;
        break;
      case "--out":
        options.outputFormat = parseOutputFormat(readFlagValue(args, i, arg));
        i++;
        break;
      case "--outdir":
      case "--outfile":
        options.outputDir = readFlagValue(args, i, arg);
        i++;
        break;
      default:
        throw new CliError(`Invalid argument "${arg}"`);
    }
  }

  if (!options.inputFile) {
    throw new CliError("Input file not specified");
  }

  if (validatePaths && !fs.existsSync(options.inputFile)) {
    throw new CliError(`Input file ${options.inputFile} does not exist`);
  }

  if (options.inputFormat === EmbedderInputFormat.Text) {
    throw new CliError("Text input format is not supported yet");
  }

  return options;
}

export async function runEmbedder(
  options: EmbedderOptions,
  env: NodeJS.ProcessEnv = process.env
): Promise<EmbeddingDocuments> {
  if (options.outputFormat !== EmbedderOutputFormat.HNSWIndex) {
    throw new Error("Only local HNSW output is supported right now.");
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY env not set. Exiting...");
  }

  const input = readSummariesFromFile(options.inputFile);
  const model = new OpenAIChat({ modelName: getOpenAiModel(env) });
  const embeddings = new OpenAIEmbeddings();
  const embeddingDocuments = await buildEmbeddingDocuments(input, async (globalSummary) => {
    const result = await model.generate([
      `Give a one sentence summary of the following. Only give the sentence and do not say anything else: ${globalSummary}`
    ]);
    return result.generations[0][0].text.trim();
  });

  if (embeddingDocuments.docs.length === 0) {
    throw new Error("No summary chunks found to embed.");
  }

  console.log("Creating embeddings...");
  const embeds = await embeddings.embedDocuments(embeddingDocuments.texts);
  console.log("Embeddings created.");

  const hnsw = new HNSWLib(embeddings, { space: "cosine" });
  await hnsw.addVectors(embeds, embeddingDocuments.docs);
  await hnsw.save(options.outputDir);
  console.log(`Saved HNSW index to ${options.outputDir}`);

  return embeddingDocuments;
}

export function readSummariesFromFile(inputFile: string): Summaries {
  try {
    return JSON.parse(fs.readFileSync(inputFile, "utf-8")) as Summaries;
  } catch (error) {
    throw new Error(`Unable to read summarization JSON from ${inputFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function buildEmbeddingDocuments(
  summaries: Summaries,
  summarizeGlobalSummary: (globalSummary: string) => string | Promise<string> = (globalSummary) => globalSummary
): Promise<EmbeddingDocuments> {
  const soliditySummaries = summaries.solidity;

  if (!soliditySummaries) {
    throw new Error("Summarization input does not contain a solidity section.");
  }

  const texts: string[] = [];
  const docs: Document[] = [];
  const fileSummaries: SingleFileSummary[] = Object.values(soliditySummaries);

  for (let i = 0; i < fileSummaries.length; i++) {
    const fileSummary = fileSummaries[i];
    console.log(`Preparing embeddings for file ${i + 1} of ${fileSummaries.length}...`);

    const globalShortSummary = await summarizeGlobalSummary(fileSummary.globalSummary);
    const chunkSummaries = Object.values(fileSummary.chunkedSummaries);

    for (const chunkSummary of chunkSummaries) {
      const pageContent = [
        `File Context: ${globalShortSummary}`,
        `Section Summary: ${chunkSummary.summary}`,
        `Section Content: ${chunkSummary.content}`
      ].join("\n\n");

      texts.push(pageContent);
      docs.push(new Document({
        pageContent,
        metadata: {
          filename: fileSummary.filename,
          title: chunkSummary.title
        }
      }));
    }
  }

  return { texts, docs };
}

export async function main(args: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  try {
    const options = parseEmbedderArgs(args);
    await runEmbedder(options, env);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      if (error.message) {
        console.error(error.message);
      }
      if (error.showUsage) {
        console.log(getEmbedderUsage());
      }
      return error.exitCode;
    }

    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function parseInputFormat(value: string): EmbedderInputFormat {
  const normalized = value.trim().toLowerCase();

  if (!Object.values(EmbedderInputFormat).includes(normalized as EmbedderInputFormat)) {
    throw new CliError(`Invalid input format "${value}"`);
  }

  return normalized as EmbedderInputFormat;
}

function parseOutputFormat(value: string): EmbedderOutputFormat {
  const normalized = value.trim().toLowerCase();

  if (!Object.values(EmbedderOutputFormat).includes(normalized as EmbedderOutputFormat)) {
    throw new CliError(`Invalid output format "${value}"`);
  }

  return normalized as EmbedderOutputFormat;
}

if (isDirectCliEntry(import.meta.url)) {
  void runCli(() => main());
}
