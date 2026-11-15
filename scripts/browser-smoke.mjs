import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.ARCHWISE_PLAYWRIGHT_ENTRY;
if (!modulePath)
  throw new Error('Set ARCHWISE_PLAYWRIGHT_ENTRY to the installed playwright entry point.');
const { chromium } = await import(pathToFileURL(modulePath).href);

const runner = spawn(
  process.execPath,
  ['apps/cli/dist/bin.js', '--serve', '--no-open', '--path', '.'],
  {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let browser;
let output = '';
const urlReady = new Promise((resolve, reject) => {
  runner.stdout.setEncoding('utf8');
  runner.stdout.on('data', (chunk) => {
    output += chunk;
    const match = output.match(/Local session URL:\s*(https?:\/\/[^\s]+)/);
    if (match) resolve(match[1]);
  });
  runner.once('exit', (code) => reject(new Error(`Local Archwise server exited with ${code}.`)));
  runner.once('error', reject);
});
const timeout = AbortSignal.timeout(30_000);
try {
  const url = await Promise.race([
    urlReady,
    new Promise((_, reject) =>
      timeout.addEventListener('abort', () => reject(new Error('Server bootstrap timed out.')), {
        once: true,
      }),
    ),
  ]);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.ARCHWISE_BROWSER_CHANNEL
      ? { channel: process.env.ARCHWISE_BROWSER_CHANNEL }
      : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // The one-time bootstrap URL contains a private session token. Never log it.
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sandbox · Build' }).waitFor();
  await page.getByRole('button', { name: 'Add Client' }).click();
  await page.getByRole('button', { name: 'Add App Server' }).click();
  await page.getByRole('button', { name: 'Add SQL Database' }).click();
  await page.locator('.svelte-flow__node').first().waitFor();
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__node').length >= 3,
  );
  assert.equal(
    await page.locator('.svelte-flow__node').count(),
    3,
    'Three proposed components must render',
  );

  // The inspector controls the *same* persistent simulation draft.
  const inspector = page.getByRole('region', { name: 'Selected component properties' });
  await inspector.waitFor();
  await inspector.locator('#inspector-name').fill('SQL Primary');
  await inspector.locator('#inspector-capacity').fill('175');
  await inspector.locator('#inspector-capacity').press('Tab');
  await page.getByText('SQL Primary').first().waitFor();

  const nodes = page.locator('.svelte-flow__node');
  const client = nodes.filter({ hasText: 'Client' });
  const app = nodes.filter({ hasText: 'App Server' });
  const database = nodes.filter({ hasText: 'SQL Primary' });

  let dragFallbacks = 0;
  async function link(from, to) {
    const source = from.locator('.svelte-flow__handle.source');
    const target = to.locator('.svelte-flow__handle.target');
    const a = await source.boundingBox();
    const b = await target.boundingBox();
    if (!a || !b) throw new Error('Expected visible source and target connection handles.');
    const previousCount = await page.locator('.svelte-flow__edge').count();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    if ((await page.locator('.svelte-flow__edge').count()) <= previousCount) {
      dragFallbacks += 1;
      console.log('Drag did not add an edge; testing click-to-connect fallback.');
      await source.click();
      await target.click();
      await page.waitForTimeout(400);
    }
    if ((await page.locator('.svelte-flow__edge').count()) <= previousCount) {
      const notices = await page.locator('.persistence-status').allTextContents();
      const handles = await page.locator('.svelte-flow__handle').evaluateAll((items) =>
        items.map((item) => ({
          classes: item.className,
          rect: item.getBoundingClientRect().toJSON(),
          ariaLabel: item.getAttribute('aria-label'),
        })),
      );
      console.error(
        'Connection diagnostics:',
        JSON.stringify({ notices, handles, pageErrors: errors }),
      );
      await page.screenshot({ path: '/tmp/archwise-browser-connection.png', fullPage: true });
      throw new Error('Neither drag nor click connected the selected handles.');
    }
  }
  await link(client, app);
  await link(app, database);
  assert.equal(
    await page.locator('.svelte-flow__edge').count(),
    2,
    'Two actual Svelte Flow connections must render',
  );
  if (dragFallbacks > 0) {
    console.warn(`${dragFallbacks} connections required click-to-connect; drag remains unverified.`);
  }

  await page.locator('.archwise-edge-pill').filter({ hasText: 'DB' }).click();
  const connectionPanel = page.getByRole('region', { name: 'Connection intent editor' });
  await connectionPanel.waitFor();
  await connectionPanel.locator('#edge-intent').selectOption('REQ');
  await page.locator('.archwise-edge-pill').filter({ hasText: 'REQ' }).first().waitFor();
  await connectionPanel.locator('#edge-intent').selectOption('DB');

  // This tests saved JSON as well as browser restoration, not just a screenshot.
  const savedDocument = async () =>
    page.evaluate(() => {
      const key = Object.keys(globalThis.localStorage).find((item) =>
        item.startsWith('archwise:sandbox:1:'),
      );
      return key ? JSON.parse(globalThis.localStorage.getItem(key)) : null;
    });
  await page.waitForFunction(() => {
    const key = Object.keys(globalThis.localStorage).find((item) =>
      item.startsWith('archwise:sandbox:1:'),
    );
    if (!key) return false;
    const doc = JSON.parse(globalThis.localStorage.getItem(key));
    return (
      doc.nodes.length === 3 &&
      doc.connections.length === 2 &&
      doc.nodes.some((n) => n.label === 'SQL Primary') &&
      doc.draft.capacities[doc.nodes.find((n) => n.label === 'SQL Primary').id] === 175
    );
  });
  const before = await savedDocument();
  assert.equal(before.connections.find((e) => e.intent === 'DB')?.intent, 'DB');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__node').length === 3,
  );
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__edge').length === 2,
  );
  const after = await savedDocument();
  assert.equal(after.nodes.length, 3);
  assert.equal(after.connections.length, 2);
  assert(after.nodes.some((n) => n.label === 'SQL Primary'));
  assert.deepEqual(after.draft.capacities, before.draft.capacities);

  await page.getByRole('button', { name: 'Explore · Inspect' }).click();
  await page.getByRole('button', { name: 'Sandbox · Build' }).click();
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__edge').length === 2,
  );
  assert.deepEqual(errors, [], 'Browser runtime errors must not occur');
  console.log(
    'Browser smoke passed: quick-add, custom nodes, inspector, handles, semantic edges, persistence, reload and mode switching.',
  );
} finally {
  await browser?.close();
  runner.kill('SIGTERM');
}
