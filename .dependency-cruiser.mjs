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
