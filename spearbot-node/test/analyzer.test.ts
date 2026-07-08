import { describe, expect, it } from "vitest";
import { CliError } from "../src/lib/cli";
import { parseAnalyzerArgs } from "../src/scripts/analyzer";

describe("analyzer CLI helpers", () => {
  it("parses question, index path, and retrieval count", () => {
    const options = parseAnalyzerArgs([
      "--index",
      "tmp/index",
      "--k",
      "7",
      "What",
      "does",
      "withdraw",
      "do?"
    ], process.cwd(), false);

    expect(options).toEqual({
      question: "What does withdraw do?",
      indexPath: "tmp/index",
      k: 7
    });
  });

  it("requires a question", () => {
    expect(() => parseAnalyzerArgs(["--k", "3"], process.cwd(), false)).toThrow(CliError);
  });
});
