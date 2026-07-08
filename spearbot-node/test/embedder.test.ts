import * as path from "path";
import { describe, expect, it } from "vitest";
import { CliError } from "../src/lib/cli";
import {
  buildEmbeddingDocuments,
  EmbedderInputFormat,
  EmbedderOutputFormat,
  parseEmbedderArgs,
  readSummariesFromFile,
  runEmbedder
} from "../src/scripts/embedder";

describe("embedder helpers", () => {
  it("parses output directory aliases", () => {
    const options = parseEmbedderArgs([
      "--in",
      "summary.json",
      "--out",
      "hnsw",
      "--outfile",
      "tmp/index"
    ], process.cwd(), false);

    expect(options).toMatchObject({
      inputFile: "summary.json",
      outputFormat: EmbedderOutputFormat.HNSWIndex,
      outputDir: "tmp/index"
    });
  });

  it("rejects text input because it is not implemented", () => {
    expect(() => parseEmbedderArgs(["--in", "input.txt", "--fmt", "text"], process.cwd(), false))
      .toThrow(CliError);
  });

  it("loads fixture summaries and builds embedding documents without OpenAI", async () => {
    const summaries = readSummariesFromFile(path.join(process.cwd(), "test", "fixtures", "sample-summary.json"));
    const result = await buildEmbeddingDocuments(summaries, (summary) => `Short: ${summary}`);

    expect(result.texts).toHaveLength(1);
    expect(result.docs).toHaveLength(1);
    expect(result.texts[0]).toContain("File Context: Short: SimpleVault tracks deposits");
    expect(result.texts[0]).toContain("Section Summary: The deposit function increases");
    expect(result.docs[0].metadata).toMatchObject({
      filename: "test/fixtures/contracts/SimpleVault.sol",
      title: "Vault Deposit Flow"
    });
  });

  it("fails unsupported output targets before checking OpenAI credentials", async () => {
    await expect(runEmbedder({
      inputFile: "summary.json",
      inputFormat: EmbedderInputFormat.Json,
      outputFormat: EmbedderOutputFormat.Both,
      outputDir: "tmp/index"
    }, {})).rejects.toThrow("Only local HNSW output is supported");
  });
});
