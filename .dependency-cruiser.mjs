export default {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
    {
      name: 'no-undeclared',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      from: { path: '^packages/domain/src/' },
      to: { pathNot: '^packages/domain/src/' },
    },
    {
      name: 'application-inward-only',
      severity: 'error',
      from: { path: '^packages/application/src/' },
      to: { pathNot: '^packages/(application|domain|schemas)/' },
    },
    {
      name: 'storage-inward-only',
      severity: 'error',
      from: { path: '^packages/storage/src/' },
      to: {
        pathNot: '^packages/(storage|application|domain|schemas)/',
        dependencyTypesNot: ['core'],
      },
    },
    {
      name: 'discovery-inward-only',
      severity: 'error',
      from: { path: '^packages/discovery/src/' },
      to: {
        pathNot: '^packages/(discovery|application|domain|schemas)/',
        dependencyTypesNot: ['core'],
      },
    },
    {
      name: 'analyzers-inward-only',
      comment: 'Analyzers are pure: no Node built-ins, no filesystem, no apps or adapters.',
      severity: 'error',
      from: { path: '^packages/analyzers/src/' },
      to: {
        pathNot: [
          '^packages/(analyzers|application|domain)/',
          'node_modules/yaml/',
          'node_modules/[.]pnpm/yaml@',
        ],
      },
    },
    {
      name: 'demo-analyzer-uses-contract-only',
      comment: 'Proves an analyzer can be written outside the core with only the public contract.',
      severity: 'error',
      from: { path: '^packages/test-fixtures/src/demo-analyzer' },
      to: { pathNot: '^packages/(application|domain)/' },
    },
    {
      name: 'schemas-inward-only',
      severity: 'error',
      from: { path: '^packages/schemas/src/' },
      to: { path: '^(apps/|packages/(?!schemas/|domain/))' },
    },
    {
      name: 'browser-no-node',
      severity: 'error',
      from: { path: '^apps/web/src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-private-cross-package',
      severity: 'error',
      from: { path: '^(packages/[^/]+|apps/[^/]+)/src/' },
      to: { path: '^(packages/[^/]+|apps/[^/]+)/src/', pathNot: '^$1/' },
    },
    {
      name: 'no-test-helpers-in-production',
      severity: 'error',
      from: { path: '^(apps|packages)/[^/]+/src/', pathNot: '^packages/test-fixtures/' },
      to: { path: '^packages/test-fixtures/' },
    },
    {
      name: 'no-relative-cross-package',
      severity: 'error',
      from: { path: '^(packages/[^/]+|apps/[^/]+)/src/' },
      to: {
        path: '^(packages/[^/]+|apps/[^/]+)/',
        pathNot: '^$1/',
        dependencyTypes: ['local'],
      },
    },
  ],
};
