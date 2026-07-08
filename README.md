# Spearbot

Spearbot is a TypeScript CLI toolchain for exploring Solidity audit targets with LLM-generated summaries and local semantic search. It ingests Solidity and Markdown files, creates hierarchical summaries, embeds those summaries into a local HNSW vector store, and answers natural-language questions against that indexed context.

The project is intentionally script-first: each stage can run independently, but the stages compose into a lightweight audit-assistant workflow.

## Workflow

```text
Solidity / Markdown inputs
        |
        v
summarize.sh -> summarization-results.json / .md
        |
        v
embedder.sh  -> spearbot-node/vecstore/embeddings
        |
        v
analyzer.sh  -> natural-language answers with retrieved context
```

## Quickstart

Use Node 18. The root wrappers use the local tools installed inside `spearbot-node` while keeping paths relative to the directory where you invoke them.

```sh
nvm use
cp .env.example .env
export OPENAI_API_KEY=<your-api-key>
cd spearbot-node && npm install && cd ..
```

Place audit inputs in `spearbot-node/put_files_to_audit_here/` or pass a different directory.

```sh
./summarize.sh --dir spearbot-node/put_files_to_audit_here --out summarization-results.json
./embedder.sh --in summarization-results.json --out hnsw
./analyzer.sh "What access control mechanisms are in place?"
```

Run the default question set after building the vector index:

```sh
./run-default-questions.sh --out defaultQuestions.md
```

## Project Structure

- `spearbot-node/src/scripts/`: CLI entry points for summarization, embedding, analysis, and default questions.
- `spearbot-node/src/extensions/`: custom code splitting logic used for Solidity-like source chunks.
- `spearbot-node/src/types/`: shared summary output types.
- `spearbot-node/test/`: fixture-based unit tests that avoid network calls.
- `spearbot-node/put_files_to_audit_here/`: sample audit target files.

Generated summaries, default answers, and vector stores are ignored by default. Keep only small fixtures in version control.

## Development

```sh
cd spearbot-node
npm run typecheck
npm test
npm run audit:critical
```

Useful package scripts:

- `npm run summarize -- --dir <path>`: summarize text, Markdown, and Solidity files.
- `npm run embed -- --in summarization-results.json`: build a local HNSW index.
- `npm run analyze -- "question"`: query the current index.
- `npm run defaults`: run the default question set.

## Configuration

Spearbot reads credentials and model configuration from the environment:

- `OPENAI_API_KEY`: required for commands that call OpenAI.
- `OPENAI_MODEL`: optional; defaults to `gpt-4` to preserve the original behavior.

## Current Limitations

- Pinecone output is still a placeholder; local HNSW is the supported vector store.
- Tests cover CLI parsing and data shaping, not live OpenAI completions.
- The dependency stack intentionally stays on the original LangChain API for now; a major-version migration is a separate modernization project.
