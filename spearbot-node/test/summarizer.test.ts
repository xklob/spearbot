import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { CliError } from "../src/lib/cli";
import {
  findFilesWithExtension,
  generateMarkdown,
  InputFormat,
  OutputFormat,
  parseSummarizerArgs
} from "../src/scripts/summarizer";
import type { Summaries } from "../src/types/types";

describe("summarizer CLI helpers", () => {
  it("parses aliases for supported input formats", () => {
    const options = parseSummarizerArgs([
      "--dir",
      ".",
      "--exts",
      "txt,md,sol",
      "--format",
      "markdown",
      "--out",
      "summary.md"
    ], process.cwd(), false);

    expect(options).toMatchObject({
      dir: ".",
      exts: [InputFormat.Text, InputFormat.Markdown, InputFormat.Solidity],
      format: OutputFormat.Markdown,
      out: "summary.md"
    });
  });

  it("rejects unknown input formats", () => {
    expect(() => parseSummarizerArgs(["--exts", "solidity,rust"], process.cwd(), false))
      .toThrow(CliError);
  });

  it("finds files recursively in deterministic order", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spearbot-test-"));
    const nested = path.join(tmp, "nested");
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(tmp, "B.sol"), "contract B {}");
    fs.writeFileSync(path.join(tmp, "a.md"), "# Ignore");
    fs.writeFileSync(path.join(nested, "A.sol"), "contract A {}");

    expect(findFilesWithExtension(tmp, ".sol")).toEqual([
      path.join(tmp, "B.sol"),
      path.join(nested, "A.sol")
    ]);
  });

  it("renders generic summary markdown", () => {
    const summaries: Summaries = {
      solidity: {
        "SimpleVault.sol": {
          filename: "SimpleVault.sol",
          globalSummary: "Tracks deposits and withdrawals.",
          chunkedSummaries: {
            Deposit: {
              title: "Deposit",
              summary: "Adds msg.value to the caller balance.",
              content: "function deposit() external payable {}",
              tokens: {
                summary: 7,
                content: 5
              }
            }
          }
        }
      }
    };

    expect(generateMarkdown(summaries)).toContain("# Solidity");
    expect(generateMarkdown(summaries)).toContain("## SimpleVault.sol");
    expect(generateMarkdown(summaries)).toContain("### Deposit");
  });
});
