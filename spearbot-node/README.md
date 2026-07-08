# Spearbot Node Package

This directory contains the TypeScript implementation for Spearbot. Most users should run the root wrapper scripts, while contributors can run the package scripts directly from this directory.

## Commands

```sh
npm install
export OPENAI_API_KEY=<your-api-key>
npm run typecheck
npm test
npm run summarize -- --dir put_files_to_audit_here
npm run embed -- --in ../summarization-results.json
npm run analyze -- "What modifiers are used in each contract?"
```

## Modules

- `src/scripts/summarizer.ts`: discovers supported files, summarizes them, and writes JSON or Markdown output.
- `src/scripts/embedder.ts`: converts summarization JSON into embedding documents and saves an HNSW index.
- `src/scripts/analyzer.ts`: asks natural-language questions against the local vector index.
- `src/scripts/defaults.ts`: runs a short built-in question set.
- `src/extensions/codeSplitter.ts`: custom text splitters for code-oriented chunks.

The scripts are safe to import in tests because CLI execution is gated behind direct entrypoint checks.

When using the root wrapper scripts, paths are resolved from the directory where the wrapper is invoked. When using `npm run` from this package directory, paths are resolved from `spearbot-node/`.
