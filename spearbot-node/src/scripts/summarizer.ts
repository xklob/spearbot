import "dotenv/config";
import * as tiktoken from "@dqbd/tiktoken";
import * as fs from "fs";
import { loadSummarizationChain, MapReduceDocumentsChain } from "langchain/chains";
import { Document } from "langchain/document";
import { OpenAI } from "langchain/llms";
import {
  MarkdownTextSplitter,
  RecursiveCharacterTextSplitter,
  TextSplitter,
  TokenTextSplitter
} from "langchain/text_splitter";
import * as path from "path";
import { CliError, readFlagValue, runCli } from "../lib/cli";
import { getOpenAiModel, isDirectCliEntry } from "../lib/paths";
import { GenericCodeTextSplitter } from "../extensions/codeSplitter";
import { ChunkedSummary, SingleFileSummary, Summaries, SummarySetByExtension } from "../types/types";

export enum InputFormat {
  Text = "text",
  Markdown = "markdown",
  Solidity = "solidity"
}

export enum OutputFormat {
  Json = "json",
  Markdown = "markdown",
  Stdout = "stdout"
}

export interface SummarizerOptions {
  dir: string;
  exts: InputFormat[];
  out: string;
  format: OutputFormat;
}

const inputFormatAliases: Record<string, InputFormat> = {
  text: InputFormat.Text,
  txt: InputFormat.Text,
  markdown: InputFormat.Markdown,
  md: InputFormat.Markdown,
  solidity: InputFormat.Solidity,
  sol: InputFormat.Solidity
};

const extensionByInputFormat: Record<InputFormat, string> = {
  [InputFormat.Text]: ".txt",
  [InputFormat.Markdown]: ".md",
  [InputFormat.Solidity]: ".sol"
};

export function getSummarizerUsage(): string {
  return `
spear-sum

Recursively summarizes text, Markdown, and Solidity files.

Usage:
  ./summarize.sh --dir <path> --out <path> --exts text,md,solidity --format <json|markdown|stdout>

Options:
  --dir <path>       Directory to summarize. Defaults to the current directory.
  --exts <list>      Comma-separated formats: text, txt, markdown, md, solidity, sol.
  --out <path>       Output file path. Defaults to summarization-results.json.
  --format <format>  Output format: json, markdown, or stdout. Defaults to json.
`;
}

export function parseSummarizerArgs(
  args: string[],
  cwd: string = process.cwd(),
  validatePaths = true
): SummarizerOptions {
  const options: SummarizerOptions = {
    dir: cwd,
    exts: [InputFormat.Text, InputFormat.Markdown, InputFormat.Solidity],
    out: "summarization-results.json",
    format: OutputFormat.Json
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--help":
      case "-h":
        throw new CliError("", 0);
      case "--dir":
        options.dir = readFlagValue(args, i, arg);
        i++;
        break;
      case "--out":
        options.out = readFlagValue(args, i, arg);
        i++;
        break;
      case "--exts":
        options.exts = parseInputFormats(readFlagValue(args, i, arg));
        i++;
        break;
      case "--format":
        options.format = parseOutputFormat(readFlagValue(args, i, arg));
        i++;
        break;
      default:
        throw new CliError(`Invalid argument "${arg}"`);
    }
  }

  if (validatePaths && !fs.existsSync(options.dir)) {
    throw new CliError(`Directory ${options.dir} does not exist`);
  }

  if (!options.out) {
    throw new CliError("Output filename cannot be empty");
  }

  return options;
}

export async function runSummarizer(
  options: SummarizerOptions,
  env: NodeJS.ProcessEnv = process.env
): Promise<Summaries> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY env not set. Exiting...");
  }

  const model = new OpenAI({
    temperature: 0,
    openAIApiKey: env.OPENAI_API_KEY,
    modelName: getOpenAiModel(env),
    maxTokens: 750
  });

  const summaries = await summarizeDirectory(options, model);
  outputSummaries(summaries, options.out, options.format);

  if (options.format !== OutputFormat.Markdown) {
    fs.writeFileSync("summarization-results.md", generateMarkdown(summaries));
  }

  return summaries;
}

export async function summarizeDirectory(options: SummarizerOptions, model: OpenAI): Promise<Summaries> {
  const filesByExtension: Record<string, string[]> = {};

  for (const ext of options.exts) {
    const files = findFilesWithExtension(options.dir, extensionByInputFormat[ext]);
    filesByExtension[ext] = files;
    console.log(`Found ${files.length} ${ext} files`);
  }

  const summaries: Summaries = {};

  for (const ext of Object.keys(filesByExtension)) {
    summaries[ext] = await summarizeFiles(filesByExtension[ext], ext as InputFormat, model);
  }

  return summaries;
}

export function generateMarkdown(summaries: Summaries): string {
  const sections: string[] = [];

  for (const [format, files] of Object.entries(summaries)) {
    const lines = [`# ${formatHeadingName(format)}`, ""];

    for (const [filename, fileSummaryObj] of Object.entries(files)) {
      lines.push(`## ${filename}`, "", `Summary: ${fileSummaryObj.globalSummary}`, "");

      for (const chunk of Object.values(fileSummaryObj.chunkedSummaries)) {
        lines.push(`### ${chunk.title}`, "", chunk.summary, "");
      }
    }

    sections.push(lines.join("\n").trimEnd());
  }

  return sections.length > 0
    ? `${sections.join("\n\n")}\n`
    : "# Summary\n\nNo summaries available.\n";
}

export async function summarizeFiles(
  filenames: string[],
  ext: InputFormat,
  model: OpenAI
): Promise<SummarySetByExtension> {
  const summaries: SummarySetByExtension = {};

  for (const filename of filenames) {
    console.log(`Summarizing ${filename}...`);

    const contents = fs.readFileSync(filename, "utf8");
    const fileSummary = await summarizeFile(filename, contents, ext, model);
    summaries[filename] = fileSummary;
  }

  return summaries;
}

export async function summarizeFile(
  filename: string,
  content: string,
  ext: InputFormat,
  model: OpenAI
): Promise<SingleFileSummary> {
  const globalDoc = new Document({ pageContent: content });
  const splitDocs = await splitContent(content, ext);
  const summarizationChain = loadSummarizationChain(model, { type: "map_reduce" }) as MapReduceDocumentsChain;

  console.log("Summarizing entire file...");

  let globalDocs = [globalDoc];
  const tokenCount = await model.getNumTokens(globalDoc.pageContent);

  if (tokenCount > 3000) {
    console.log(`File ${filename} is too large to summarize in one go (${tokenCount} tokens). Breaking it up...`);
    globalDocs = await new TokenTextSplitter({ chunkSize: 1500 }).splitDocuments(globalDocs);
  }

  const globalSummary = await summarizationChain.call({
    input_documents: globalDocs
  });

  const chunkedSummaries: Record<string, ChunkedSummary> = {};
  const resolvedChunks: ChunkedSummary[] = [];
  const concurrency = 10;

  console.log(`Summarizing ${splitDocs.length} chunks...`);

  for (let i = 0; i < splitDocs.length; i += concurrency) {
    const promises: Promise<ChunkedSummary>[] = [];

    console.log(`Summarizing chunks ${i} to ${Math.min(i + concurrency, splitDocs.length)}...`);

    for (let j = 0; j < concurrency; j++) {
      if (i + j >= splitDocs.length) {
        break;
      }

      promises.push(getChunkSummary(splitDocs[i + j], model));
    }

    resolvedChunks.push(...await Promise.all(promises));
  }

  for (const chunkSummary of resolvedChunks) {
    chunkedSummaries[chunkSummary.title] = chunkSummary;
  }

  return {
    filename,
    globalSummary: globalSummary.text as string,
    chunkedSummaries
  };
}

export async function getChunkSummary(chunk: Document, model: OpenAI): Promise<ChunkedSummary> {
  const title = await getThreeWordSummary(chunk.pageContent, model);
  const chunkSummaryResult = await model.generate([
    `Give a detailed and technical summary of the following content:\n${chunk.pageContent}\n`
  ]);
  const chunkSummary = chunkSummaryResult.generations[0][0].text;

  return {
    title,
    summary: chunkSummary,
    content: chunk.pageContent,
    tokens: {
      summary: await getTokenCount(chunkSummary),
      content: await getTokenCount(chunk.pageContent)
    }
  };
}

export async function getThreeWordSummary(text: string, model: OpenAI): Promise<string> {
  const result = await model.generate([
    `Given the following text, generate a three word identifier/title. Remember ONLY output the three words, and literally nothing else.\n${text}\n\n`
  ]);

  return result.generations[0][0].text.trim();
}

export async function getTokenCount(text: string): Promise<number> {
  const enc = tiktoken.get_encoding("cl100k_base");
  return enc.encode_ordinary(text).length;
}

export function outputSummaries(summaries: Summaries, out: string, format: OutputFormat): void {
  switch (format) {
    case OutputFormat.Json:
      fs.writeFileSync(out, JSON.stringify(summaries, null, 2));
      break;
    case OutputFormat.Markdown:
      fs.writeFileSync(out, generateMarkdown(summaries));
      break;
    case OutputFormat.Stdout:
      console.log(JSON.stringify(summaries, null, 2));
      break;
  }
}

export function findFilesWithExtension(directory: string, extension: string): string[] {
  const foundFileNames: string[] = [];
  const files = fs.readdirSync(directory).sort();

  for (const file of files) {
    const filePath = path.join(directory, file);
    const fileStat = fs.statSync(filePath);

    if (fileStat.isDirectory()) {
      foundFileNames.push(...findFilesWithExtension(filePath, extension));
    } else if (fileStat.isFile() && path.extname(filePath) === extension) {
      foundFileNames.push(filePath);
    }
  }

  return foundFileNames;
}

export async function splitContent(content: string, contentType: InputFormat): Promise<Document[]> {
  let splitter: TextSplitter;

  switch (contentType) {
    case InputFormat.Text:
      splitter = new RecursiveCharacterTextSplitter();
      break;
    case InputFormat.Markdown:
      splitter = new MarkdownTextSplitter();
      break;
    case InputFormat.Solidity:
      splitter = new GenericCodeTextSplitter(["contract", "interface", "function", "constructor"], {
        chunkSize: 1,
        chunkOverlap: 0
      });
      break;
  }

  return splitter.createDocuments([content]);
}

export async function main(args: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  try {
    const options = parseSummarizerArgs(args);
    await runSummarizer(options, env);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      if (error.message) {
        console.error(error.message);
      }
      if (error.showUsage) {
        console.log(getSummarizerUsage());
      }
      return error.exitCode;
    }

    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function parseInputFormats(value: string): InputFormat[] {
  const formats = value.split(",")
    .map((format) => inputFormatAliases[format.trim().toLowerCase()])
    .filter((format): format is InputFormat => Boolean(format));

  if (formats.length === 0 || formats.length !== value.split(",").length) {
    throw new CliError(`Invalid extension list "${value}"`);
  }

  return formats;
}

function parseOutputFormat(value: string): OutputFormat {
  const normalized = value.trim().toLowerCase();
  if (normalized === "md") {
    return OutputFormat.Markdown;
  }

  if (!Object.values(OutputFormat).includes(normalized as OutputFormat)) {
    throw new CliError(`Invalid format "${value}"`);
  }

  return normalized as OutputFormat;
}

function formatHeadingName(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

if (isDirectCliEntry(import.meta.url)) {
  void runCli(() => main());
}
