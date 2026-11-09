import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cruise } from 'dependency-cruiser';
import rules from '../.dependency-cruiser.mjs';

const root = resolve(process.argv[2] ?? '.');
process.chdir(root);
const inputs = ['apps', 'packages'].flatMap((base) =>
  existsSync(base)
    ? readdirSync(base, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(`${base}/${entry.name}/src`))
        .map((entry) => `${base}/${entry.name}/src`)
    : [],
);
if (inputs.length === 0) throw new Error('No source packages found');
const result = await cruise(inputs, {
  validate: true,
  ruleSet: rules,
  outputType: 'json',
  tsPreCompilationDeps: true,
  exclude: { path: '\\.(test|spec)\\.[cm]?[jt]sx?$' },
  doNotFollow: { path: 'node_modules|/dist/' },
  enhancedResolveOptions: {
    exportsFields: ['exports'],
    conditionNames: ['import', 'node', 'default'],
  },
});
const report = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
for (const violation of report.summary.violations) {
  console.error(`${violation.rule.name}: ${violation.from} -> ${violation.to}`);
}
process.exitCode = report.summary.error > 0 ? 1 : 0;
if (process.exitCode === 0) console.log('Architecture boundaries passed');
