# Repository Guidelines

## Project Structure & Module Organization

This repository is a small Node/TypeScript toolchain for summarizing and querying audit targets. Root-level shell wrappers (`summarize.sh`, `embedder.sh`, `analyzer.sh`, `run-default-questions.sh`) use the package-local `tsx` binary while preserving the caller's working directory. CLI entry points live in `spearbot-node/src/scripts/`, shared utilities in `spearbot-node/src/lib/` and `spearbot-node/src/extensions/`, reusable types in `spearbot-node/src/types/`, and tests/fixtures in `spearbot-node/test/`. Place Solidity or Markdown inputs in `spearbot-node/put_files_to_audit_here/`.

## Build, Test, and Development Commands

- `nvm use 18`: select the Node version documented for this project.
- `cd spearbot-node && npm install`: install runtime and TypeScript dependencies.
- `export OPENAI_API_KEY=<key>`: required for summarization, embedding, and analysis.
- `./summarize.sh --dir spearbot-node/put_files_to_audit_here`: summarize audit inputs into `summarization-results.json` and Markdown.
- `./embedder.sh --in summarization-results.json --out hnsw`: build the local vector index.
- `./analyzer.sh "What access control mechanisms are in place?"`: query the embedded codebase.
- `cd spearbot-node && npm run typecheck`: type-check without writing `dist/`.
- `cd spearbot-node && npm test`: run fixture-based Vitest tests.

## Coding Style & Naming Conventions

Use TypeScript ESM imports and keep `tsconfig.json` strictness (`strict`, `noImplicitAny`, `strictNullChecks`) passing. Prefer explicit interfaces for CLI option objects and structured data. Use `camelCase` for variables and functions, `PascalCase` for interfaces, enums, and exported types, and descriptive script filenames such as `summarizer.ts`. No formatter or linter is configured, so match nearby style and avoid unrelated formatting churn.

## Testing Guidelines

Tests use Vitest and local fixtures under `spearbot-node/test/`; they should not require `OPENAI_API_KEY` or network access. Validate changes with `npm run typecheck` and `npm test`. For live pipeline changes, add a focused manual smoke run of the command you touched, such as `./summarize.sh` against a small sample directory or `./analyzer.sh` against a freshly built local index.

## Commit & Pull Request Guidelines

Recent commits use short, plain-English summaries such as `Touch-up the summarizer`, `Add defaults`, and `Fixes and optimizations`. Keep subjects concise and imperative when possible. Pull requests should describe the changed pipeline stage, list commands run, note whether generated artifacts were intentionally updated, and call out required environment variables or model/API behavior.

## Security & Configuration Tips

Keep `OPENAI_API_KEY` in the environment or an ignored local `.env`; never commit secrets. Review generated summaries before sharing them because they may contain source excerpts from audit targets. Generated summaries, default answers, and vector stores are ignored; commit only small fixtures that are useful for tests or docs.
