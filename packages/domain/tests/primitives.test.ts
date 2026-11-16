import { describe, expect, test } from 'vitest';
import {
  checkRelativePath,
  compareCodeUnits,
  containsHomePath,
  containsSecretPattern,
  isValidCode,
  isValidId,
  isValidLabel,
  isValidTimestamp,
  LIMITS,
  redactSensitiveText,
} from '../src/index.js';
import { syntheticSecrets } from './secrets.js';

describe('isValidId', () => {
  test.each(['a', 'A9._:-x', 'a'.repeat(128)])('accepts %s', (id) => {
    expect(isValidId(id)).toBe(true);
  });
  test.each(['', '-a', '.a', 'a b', 'é', 'a'.repeat(129)])('rejects %j', (id) => {
    expect(isValidId(id)).toBe(false);
  });
});

describe('isValidCode', () => {
  test.each(['manifest-declared', 'a', 'x1-y2'])('accepts %s', (code) => {
    expect(isValidCode(code)).toBe(true);
  });
  test.each(['', 'Upper', '1abc', 'a_b', 'a'.repeat(65)])('rejects %j', (code) => {
    expect(isValidCode(code)).toBe(false);
  });
});

describe('isValidLabel', () => {
  test.each(['🚀'.repeat(256), 'e\u0301', 'Service A'])('accepts %j', (label) => {
    expect(isValidLabel(label)).toBe(true);
  });
  test.each(['', '🚀'.repeat(257), 'a\u0000', 'a\u0085', 'a\u007f', 'line\nbreak'])(
    'rejects %j',
    (label) => {
      expect(isValidLabel(label)).toBe(false);
    },
  );
});

describe('isValidTimestamp', () => {
  test('accepts canonical UTC millisecond timestamps', () => {
    expect(isValidTimestamp('2026-11-15T10:20:30.000Z')).toBe(true);
  });
  test.each([
    '2026-02-30T00:00:00.000Z',
    '2026-11-15T10:20:30Z',
    '2026-11-15T10:20:30.000+00:00',
    '2026-11-15',
    'not a date',
  ])('rejects %s', (value) => {
    expect(isValidTimestamp(value)).toBe(false);
  });
});

describe('checkRelativePath', () => {
  test('accepts a normalized relative path', () => {
    expect(checkRelativePath('src/a.ts')).toBeNull();
    expect(checkRelativePath('packages/x/package.json')).toBeNull();
  });
  test.each([
    ['', 'empty'],
    ['/etc/x', 'absolute'],
    ['a\\b', 'backslash'],
    ['C:/x', 'drive-prefix'],
    ['a//b', 'empty-segment'],
    ['a/', 'empty-segment'],
    ['./a', 'dot-segment'],
    ['a/../b', 'dot-segment'],
    ['..', 'dot-segment'],
    ['a\u0000b', 'control-character'],
    ['a'.repeat(LIMITS.path + 1), 'too-long'],
  ] as const)('classifies %j as %s', (path, issue) => {
    expect(checkRelativePath(path)).toBe(issue);
  });
});

describe('containsSecretPattern', () => {
  test.each(Object.entries(syntheticSecrets))('detects %s', (_name, secret) => {
    expect(containsSecretPattern(`prefix ${secret} suffix`)).toBe(true);
  });
  test('ignores ordinary labels', () => {
    expect(containsSecretPattern('ordinary-label')).toBe(false);
    expect(containsSecretPattern('desk-lamp')).toBe(false);
    expect(containsSecretPattern('mask-sensitive-fields-rule')).toBe(false);
    expect(containsSecretPattern('Disk-usage-monitor-worker')).toBe(false);
  });
});

describe('containsHomePath', () => {
  test.each([
    '/Users/alex',
    '/Users/alex/projects/app',
    'C:\\Users\\alex\\app',
    'c:/users/alex/app',
    'name at /Users/alex/x',
    'file:///Users/alex/app',
    '(/Users/alex)',
  ])('detects %s', (value) => {
    expect(containsHomePath(value)).toBe(true);
  });
  test.each([
    'src/home/page',
    'apps/users/list',
    '@scope/users',
    '/api/users',
    'GET /users/:id',
    '/home/feed',
    '/root',
    '/usr/local/lib',
    '~/projects/app',
    'ordinary-label',
  ])('ignores route-like and relative text %s', (value) => {
    expect(containsHomePath(value)).toBe(false);
  });
});

describe('redactSensitiveText', () => {
  test.each([
    ['/Users/alex/projects/app', '~/projects/app'],
    ['(/Users/alex)', '(~)'],
    ['C:\\Users\\alex\\app', '~\\app'],
    ['c:/users/alex/app', '~/app'],
    ['pkg at /Users/alex/a and /Users/bo/b', 'pkg at ~/a and ~/b'],
  ])('replaces the home directory in %s', (input, expected) => {
    expect(redactSensitiveText(input)).toBe(expected);
  });

  test('replaces the known home directory exactly, without touching routes or longer names', () => {
    const homes = ['/home/alex'];
    expect(redactSensitiveText('/home/alex/app and /home/alexander', homes)).toBe(
      '~/app and /home/alexander',
    );
    expect(redactSensitiveText('/home/alex', homes)).toBe('~');
    expect(redactSensitiveText('GET /home/feed', homes)).toBe('GET /home/feed');
    expect(redactSensitiveText('/root/app', ['/root'])).toBe('~/app');
  });

  // An unterminated private key block runs to the end of the text; the next test covers PEM.
  test.each(Object.entries(syntheticSecrets).filter(([name]) => name !== 'pem'))(
    'removes a whole %s secret',
    (_name, secret) => {
      expect(redactSensitiveText(`before ${secret} after`)).toBe('before [redacted] after');
    },
  );

  test('removes a private key body and a JWT signature, not just their prefixes', () => {
    const pem = '-----BEGIN ' + 'RSA PRIVATE KEY-----MIIEbody\nmore-----END RSA PRIVATE KEY-----';
    expect(redactSensitiveText(`a ${pem} b`)).toBe('a [redacted] b');
    expect(redactSensitiveText('-----BEGIN ' + 'PRIVATE KEY-----MIIEunterminated')).toBe(
      '[redacted]',
    );
    expect(redactSensitiveText(`${syntheticSecrets.jwt}SIGNATURE x`)).toBe('[redacted] x');
  });

  test('never reassembles a home path or a secret from adjacent pieces', () => {
    const pieces = [
      ...Object.values(syntheticSecrets),
      '/Users/alex',
      '/home/alex',
      'C:\\Users\\alex',
      '/',
      'x',
      ' ',
    ];
    for (const a of pieces) {
      for (const b of pieces) {
        for (const c of pieces) {
          const out = redactSensitiveText(a + b + c, ['/home/alex']);
          expect(containsHomePath(out), out).toBe(false);
          expect(containsSecretPattern(out), out).toBe(false);
          expect(out.includes('/home/alex/') || out.endsWith('/home/alex'), out).toBe(false);
        }
      }
    }
  });

  test('leaves ordinary text unchanged', () => {
    expect(redactSensitiveText('@scope/users-api', ['/home/alex'])).toBe('@scope/users-api');
  });
});

test('compareCodeUnits sorts by UTF-16 code unit, not locale', () => {
  expect(['b', 'B', 'a', '_'].sort(compareCodeUnits)).toEqual(['B', '_', 'a', 'b']);
  expect(compareCodeUnits('a', 'a')).toBe(0);
});

describe('length and well-formedness are measured consistently', () => {
  test('path length counts code points like labels do', () => {
    expect(checkRelativePath('\u{1F680}'.repeat(600))).toBeNull();
    expect(checkRelativePath('\u{1F680}'.repeat(LIMITS.path + 1))).toBe('too-long');
  });
  test.each(['a\ud800', '\udc00b', 'x\ud800\ud800'])(
    'rejects lone surrogates in labels: %j',
    (label) => {
      expect(isValidLabel(label)).toBe(false);
    },
  );
  test('rejects lone surrogates in paths', () => {
    expect(checkRelativePath('src/a\ud800.ts')).toBe('ill-formed-unicode');
  });
});
