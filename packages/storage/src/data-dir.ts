import { posix, win32 } from 'node:path';

/**
 * OS-appropriate application-data directory. Never inside an analyzed repository.
 * `ARCHWISE_DATA_DIR` overrides the default (used by tests and by users who relocate data).
 */
export function resolveDataDir(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
  home: string,
): string {
  const override = env.ARCHWISE_DATA_DIR;
  if (override) return override;
  if (platform === 'win32') {
    return win32.join(env.LOCALAPPDATA ?? win32.join(home, 'AppData', 'Local'), 'Archwise');
  }
  if (platform === 'darwin') return posix.join(home, 'Library', 'Application Support', 'Archwise');
  return env.XDG_DATA_HOME
    ? posix.join(env.XDG_DATA_HOME, 'archwise')
    : posix.join(home, '.local', 'share', 'archwise');
}
