export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CliCommand =
  | { readonly kind: 'output'; readonly result: CliResult }
  | { readonly kind: 'inspect'; readonly path: string; readonly json: boolean; readonly graph: boolean };

/** Parse arguments without touching the filesystem or executing project code. */
export function parseCli(args: readonly string[], version = 'development'): CliCommand {
  if (args.length === 1 && args[0] === '--version') {
    return { kind: 'output', result: { exitCode: 0, stdout: `${version}\n`, stderr: '' } };
  }
  if (args.length === 1 && args[0] === '--help') {
    return {
      kind: 'output',
      result: {
        exitCode: 0,
        stdout:
          'Usage: archwise [--path DIRECTORY] [--json | --graph] [--help | --version]\n' +
          'Read-only inventory of local Node.js package manifests. --graph emits a deterministic evidence-backed graph.\n',
        stderr: '',
      },
    };
  }
  let path = '.';
  let json = false;
  let graph = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path' && args[i + 1] && !args[i + 1]!.startsWith('--')) {
      path = args[++i]!;
    } else if (args[i] === '--json') {
      json = true;
    } else if (args[i] === '--graph') {
      graph = true;
    } else {
      return {
        kind: 'output',
        result: { exitCode: 2, stdout: '', stderr: `Unsupported argument: ${args[i]}. Run archwise --help.\n` },
      };
    }
  }
  if (json && graph) {
    return {
      kind: 'output',
      result: { exitCode: 2, stdout: '', stderr: '--json and --graph are mutually exclusive.\n' },
    };
  }
  return { kind: 'inspect', path, json, graph };
}

/** Kept as a pure CLI helper for compatibility with the existing CLI tests. */
export function runCli(args: readonly string[], version = 'development'): CliResult {
  const command = parseCli(args, version);
  return command.kind === 'output'
    ? command.result
    : {
        exitCode: 0,
        stdout: `Workspace inspection configured for ${command.path}. Run the executable to inspect.\n`,
        stderr: '',
      };
}
