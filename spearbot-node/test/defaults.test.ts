import { describe, expect, it } from "vitest";
import { answersToMarkdown } from "../src/scripts/defaults";

describe("default question markdown", () => {
  it("renders numbered answers in fenced blocks", () => {
    const markdown = answersToMarkdown([
      {
        question: "What does the vault do?",
        answer: "It stores balances."
      }
    ]);

    expect(markdown).toContain("1. What does the vault do?");
    expect(markdown).toContain("```\nIt stores balances.\n```");
  });
});
