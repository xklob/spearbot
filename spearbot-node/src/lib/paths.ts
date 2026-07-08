import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

export const DEFAULT_OPENAI_MODEL = "gpt-4";

export function getPackageRoot(cwd: string = process.cwd()): string {
  const nestedPackage = path.join(cwd, "spearbot-node", "package.json");
  if (fs.existsSync(nestedPackage)) {
    return path.join(cwd, "spearbot-node");
  }

  const localPackage = path.join(cwd, "package.json");
  if (fs.existsSync(localPackage)) {
    return cwd;
  }

  return path.basename(cwd) === "spearbot-node" ? cwd : path.join(cwd, "spearbot-node");
}

export function getDefaultVectorStorePath(cwd: string = process.cwd()): string {
  return path.join(getPackageRoot(cwd), "vecstore", "embeddings");
}

export function isDirectCliEntry(importMetaUrl: string, argvPath: string | undefined = process.argv[1]): boolean {
  return Boolean(argvPath && path.resolve(argvPath) === fileURLToPath(importMetaUrl));
}

export function getOpenAiModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
}
