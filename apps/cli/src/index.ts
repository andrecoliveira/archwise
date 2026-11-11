export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}
export function runCli(args: readonly string[], version = 'development'): CliResult {
  if (args.length === 1 && args[0] === '--version') {
    return { exitCode: 0, stdout: `${version}\n`, stderr: '' };
  }
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
    return {
      exitCode: 0,
      stdout:
        'Archwise foundation\nUsage: archwise [--help | --version]\nArchitecture discovery is not implemented yet.\n',
      stderr: '',
    };
  }
  return { exitCode: 2, stdout: '', stderr: 'Unsupported arguments. Run archwise --help.\n' };
}
