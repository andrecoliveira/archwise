import { expect, test } from 'vitest';
import { resolveDataDir } from '../src/index.js';

test('ARCHWISE_DATA_DIR overrides every platform default', () => {
  expect(resolveDataDir({ ARCHWISE_DATA_DIR: '/custom/store' }, 'darwin', '/Users/u')).toBe(
    '/custom/store',
  );
});

test('macOS uses Application Support', () => {
  expect(resolveDataDir({}, 'darwin', '/Users/u')).toBe(
    '/Users/u/Library/Application Support/Archwise',
  );
});

test('Linux prefers XDG_DATA_HOME, then ~/.local/share', () => {
  expect(resolveDataDir({ XDG_DATA_HOME: '/xdg' }, 'linux', '/home/u')).toBe('/xdg/archwise');
  expect(resolveDataDir({}, 'linux', '/home/u')).toBe('/home/u/.local/share/archwise');
});

test('Windows uses LOCALAPPDATA', () => {
  expect(
    resolveDataDir({ LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'win32', 'C:\\Users\\u'),
  ).toBe('C:\\Users\\u\\AppData\\Local\\Archwise');
  expect(resolveDataDir({}, 'win32', 'C:\\Users\\u')).toBe(
    'C:\\Users\\u\\AppData\\Local\\Archwise',
  );
});
