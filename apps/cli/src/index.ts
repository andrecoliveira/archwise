export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliRoot {
  readonly path: string;
  readonly flag: '--path' | '--repo';
}

const usageError = (stderr: string): CliCommand => ({
  kind: 'output',
  result: { exitCode: 2, stdout: '', stderr },
});

export type CliCommand =
  | { readonly kind: 'output'; readonly result: CliResult }
  | {
      readonly kind: 'inspect';
      /** User roots from --path and --repo, in order; empty when --workspace is used. */
      readonly roots: readonly CliRoot[];
      /** Workspace file from --workspace, or null. */
      readonly workspace: string | null;
      readonly json: boolean;
      readonly graph: boolean;
      readonly serve: boolean;
      readonly open: boolean;
      /** List saved sessions for the workspace instead of inspecting. */
      readonly sessions: boolean;
      /** Use the local session store (disabled by --no-store). */
      readonly store: boolean;
      /** `latest` or a session ID to resume when serving; null starts a fresh session. */
      readonly resume: string | null;
    };

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
          'Usage: archwise [--path DIRECTORY | --repo DIRECTORY... | --workspace FILE] [--json | --graph | --sessions | --serve [--no-open] [--no-store | --resume latest|SESSION_ID]] [--help | --version]\n' +
          'Read-only inventory of local Node.js package manifests. --graph emits a deterministic evidence-backed graph.\n' +
          '--repo may repeat to compose several repositories into one workspace (--path is an alias).\n' +
          '--workspace reads a reviewed archwise.workspace JSON file that lists the repositories.\n' +
          '--sessions lists saved Sandbox sessions for this project. --serve opens the local Studio and records\n' +
          'the discovered graph in the local store outside the project; --no-store disables the store.\n' +
          '--resume continues the newest (latest) or a specific saved session instead of a fresh one.\n',
        stderr: '',
      },
    };
  }
  const roots: CliRoot[] = [];
  let workspace: string | null = null;
  let json = false;
  let graph = false;
  let serve = false;
  let open = true;
  let sessions = false;
  let store = true;
  let resume: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--path' || flag === '--repo' || flag === '--workspace') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        return usageError(
          `${flag} expects ${flag === '--workspace' ? 'a file' : 'a directory'}.\n`,
        );
      }
      i += 1;
      if (flag === '--workspace') workspace = value;
      else roots.push({ path: value, flag });
    } else if (args[i] === '--json') {
      json = true;
    } else if (args[i] === '--graph') {
      graph = true;
    } else if (args[i] === '--serve') {
      serve = true;
    } else if (args[i] === '--no-open') {
      open = false;
    } else if (args[i] === '--sessions') {
      sessions = true;
    } else if (args[i] === '--no-store') {
      store = false;
    } else if (args[i] === '--resume') {
      const value = args[i + 1];
      if (!value || !(value === 'latest' || /^ses-[0-9a-f]{24}$/.test(value))) {
        return {
          kind: 'output',
          result: {
            exitCode: 2,
            stdout: '',
            stderr: '--resume expects "latest" or a session ID from --sessions.\n',
          },
        };
      }
      resume = value;
      i += 1;
    } else {
      return {
        kind: 'output',
        result: {
          exitCode: 2,
          stdout: '',
          stderr: `Unsupported argument: ${args[i]}. Run archwise --help.\n`,
        },
      };
    }
  }
  if (workspace !== null && roots.length > 0) {
    return usageError('--workspace cannot be combined with --repo or --path.\n');
  }
  if (Number(json) + Number(graph) + Number(serve) + Number(sessions) > 1) {
    return {
      kind: 'output',
      result: {
        exitCode: 2,
        stdout: '',
        stderr: '--json, --graph, --sessions and --serve are mutually exclusive.\n',
      },
    };
  }
  if (!serve && !open) {
    return {
      kind: 'output',
      result: { exitCode: 2, stdout: '', stderr: '--no-open requires --serve.\n' },
    };
  }
  if (!serve && !store) {
    return {
      kind: 'output',
      result: { exitCode: 2, stdout: '', stderr: '--no-store requires --serve.\n' },
    };
  }
  if (resume !== null && (!serve || !store)) {
    return {
      kind: 'output',
      result: {
        exitCode: 2,
        stdout: '',
        stderr:
          '--resume requires --serve and the local store (it cannot be combined with --no-store).\n',
      },
    };
  }
  return {
    kind: 'inspect',
    roots: workspace === null && roots.length === 0 ? [{ path: '.', flag: '--path' }] : roots,
    workspace,
    json,
    graph,
    serve,
    open,
    sessions,
    store,
    resume,
  };
}

/** Kept as a pure CLI helper for compatibility with the existing CLI tests. */
export function runCli(args: readonly string[], version = 'development'): CliResult {
  const command = parseCli(args, version);
  return command.kind === 'output'
    ? command.result
    : {
        exitCode: 0,
        stdout: `Workspace inspection configured for ${command.workspace ?? command.roots.map((r) => r.path).join(', ')}. Run the executable to inspect.\n`,
        stderr: '',
      };
}
