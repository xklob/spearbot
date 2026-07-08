export class CliError extends Error {
  readonly exitCode: number;
  readonly showUsage: boolean;

  constructor(message: string, exitCode = 1, showUsage = true) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
    this.showUsage = showUsage;
  }
}

export function readFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new CliError(`Missing value for ${flag}`);
  }

  return value;
}

export function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new CliError(`Invalid ${flag} value "${value}". Expected a positive integer.`);
  }

  return parsed;
}

export async function runCli(main: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
