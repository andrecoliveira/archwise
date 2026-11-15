// Synthetic secrets are assembled at runtime so repository secret scanning does not flag this file.
export const syntheticSecrets = {
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
  github: 'ghp' + '_' + 'a'.repeat(36),
  slack: 'xox' + 'b-' + '1234567890-abc',
  apiKey: 's' + 'k-' + 'A'.repeat(24),
  jwt: 'eyJ' + 'a'.repeat(12) + '.eyJ' + 'b'.repeat(12) + '.sig',
} as const;
