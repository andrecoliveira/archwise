import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.ARCHWISE_PLAYWRIGHT_ENTRY;
if (!modulePath)
  throw new Error('Set ARCHWISE_PLAYWRIGHT_ENTRY to the installed playwright entry point.');
const { chromium } = await import(pathToFileURL(modulePath).href);

// Analyze a synthetic project and an isolated store; never the repository itself.
const fixtureRoot = await mkdtemp(join(tmpdir(), 'archwise-smoke-project-'));
const dataDir = await mkdtemp(join(tmpdir(), 'archwise-smoke-store-'));
const multiRoot = await mkdtemp(join(tmpdir(), 'archwise-smoke-multi-'));
async function writeManifest(path, manifest) {
  await mkdir(dirname(join(fixtureRoot, path)), { recursive: true });
  await writeFile(join(fixtureRoot, path), JSON.stringify(manifest));
}
await writeManifest('apps/web/package.json', {
  name: '@smoke/web',
  dependencies: { '@smoke/api': 'workspace:*' },
});
await writeManifest('apps/api/package.json', { name: '@smoke/api' });

let runner;
function startServer(roots = ['--path', fixtureRoot]) {
  runner = spawn(process.execPath, ['apps/cli/dist/bin.js', '--serve', '--no-open', ...roots], {
    cwd: process.cwd(),
    env: { ...process.env, ARCHWISE_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  return Promise.race([
    urlReady,
    new Promise((_, reject) =>
      timeout.addEventListener('abort', () => reject(new Error('Server bootstrap timed out.')), {
        once: true,
      }),
    ),
  ]);
}
async function stopServer() {
  const exited = new Promise((resolve) => runner.once('exit', resolve));
  runner.kill('SIGTERM');
  await exited;
}

let browser;
try {
  const url = await startServer();
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
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
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
  // Connection arrowheads take their colour from intent tokens through var(); they must paint.
  const arrowFills = await page.evaluate(() =>
    [...globalThis.document.querySelectorAll('.svelte-flow__edge path')]
      .map((path) => path.getAttribute('marker-end'))
      .filter(Boolean)
      .map((ref) => {
        const id = decodeURIComponent(ref.replace(/^url\(['"]?#/, '').replace(/['"]?\)$/, ''));
        const marker = globalThis.document.getElementById(id);
        const shape = marker?.querySelector('polyline, path');
        return shape ? globalThis.getComputedStyle(shape).fill : 'missing';
      }),
  );
  assert.ok(arrowFills.length >= 2, 'Connections reference arrowhead markers');
  for (const fill of arrowFills) {
    assert.ok(
      !['missing', 'none', 'rgb(0, 0, 0)'].includes(fill),
      `Arrowhead paints a token colour, got ${fill}`,
    );
  }
  if (process.env.ARCHWISE_SMOKE_SCREENSHOT_DIR) {
    await page.screenshot({
      path: join(process.env.ARCHWISE_SMOKE_SCREENSHOT_DIR, 'sandbox-connections.png'),
    });
  }
  if (dragFallbacks > 0) {
    console.warn(
      `${dragFallbacks} connections required click-to-connect; drag remains unverified.`,
    );
  }

  await page.locator('.archwise-edge-pill').filter({ hasText: 'DB' }).click();
  const connectionPanel = page.getByRole('region', { name: 'Connection intent editor' });
  await connectionPanel.waitFor();
  await connectionPanel.locator('#edge-intent').selectOption('REQ');
  await page.locator('.archwise-edge-pill').filter({ hasText: 'REQ' }).first().waitFor();
  await connectionPanel.locator('#edge-intent').selectOption('DB');

  // A/B must reflect the *effective* capacity of a horizontally scaled service.
  const appNodeId = await app.getAttribute('data-id');
  assert(appNodeId, 'App Server requires a stable Svelte Flow node ID');
  await app.click();
  const replicaInput = inspector.locator('#inspector-replicas');
  await replicaInput.waitFor();
  const simulation = page.locator('.simulation-panel');
  await simulation.locator(':scope > summary').click();
  await simulation.locator('.scenario-fields input[type="number"]').fill('200');
  await simulation.locator('.scenario-fields select').selectOption(appNodeId);
  await simulation.getByRole('button', { name: 'Save current as A' }).click();
  await replicaInput.fill('3');
  await replicaInput.press('Tab');
  await simulation.getByRole('button', { name: 'Save current as B' }).click();
  await simulation.getByText('A → B: +75.0 completed requests/second').waitFor();

  // The Sandbox autosaves to the local session store; read it back through the API.
  const savedDocument = async (target = page) =>
    target.evaluate(async () => {
      const current = await (await fetch('/api/v1/sessions/current')).json();
      if (!current.id) return null;
      const response = await fetch(`/api/v1/sessions/${current.id}`);
      if (!response.ok) return null;
      return JSON.parse((await response.json()).sandbox);
    });
  async function waitForDocument(predicate, label, target = page) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const doc = await savedDocument(target);
      if (doc && predicate(doc)) return doc;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for saved document: ${label}`);
      await target.waitForTimeout(250);
    }
  }
  await waitForDocument(
    (doc) =>
      doc.nodes.length === 3 &&
      doc.connections.length === 2 &&
      doc.nodes.some((n) => n.label === 'SQL Primary') &&
      doc.draft.capacities[doc.nodes.find((n) => n.label === 'SQL Primary').id] === 175 &&
      doc.draft.savedA &&
      doc.draft.savedB,
    'three components, two connections and A/B',
  );
  await page.locator('.save-indicator').filter({ hasText: 'All changes saved' }).waitFor();
  const before = await savedDocument();
  assert.equal(before.connections.find((e) => e.intent === 'DB')?.intent, 'DB');
  assert.equal(before.draft.replicas[appNodeId], 3);
  assert(before.draft.savedA && before.draft.savedB, 'Saved A/B snapshots must be persisted');

  await page.reload({ waitUntil: 'networkidle' });
  // A project with components opens in Explore; the saved Sandbox is one tab away.
  await page.getByRole('button', { name: 'Explore', exact: true, pressed: true }).waitFor();
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
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
  assert.deepEqual(after.draft.replicas, before.draft.replicas);

  // Switching to Explore drops a selected Sandbox component.
  await page.locator('.svelte-flow__node').filter({ hasText: 'App Server' }).click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Component inspector' })
    .getByText('Select a component on the canvas or in the list')
    .waitFor();
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__edge').length === 2,
  );
  // Prove that manual dragging changes the persisted model position.
  const appId = before.nodes.find((node) => node.label === 'App Server')?.id;
  assert(appId, 'Expected an App Server in the saved Sandbox');
  const dragTarget = page
    .locator('.svelte-flow__node')
    .filter({ hasText: 'App Server' })
    .locator('.archwise-node-head');
  const card = await dragTarget.boundingBox();
  assert(card, 'Expected a draggable custom node card');
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2 + 62, card.y + card.height / 2 + 38, { steps: 16 });
  await page.mouse.up();
  const previousApp = before.nodes.find((node) => node.id === appId);
  assert(previousApp, 'App Server needs an original saved position');
  await waitForDocument((doc) => {
    const node = doc.nodes.find((item) => item.id === appId);
    return node && (node.x !== previousApp.x || node.y !== previousApp.y);
  }, 'dragged App Server position');
  const moved = await savedDocument();
  const movedApp = moved.nodes.find((node) => node.id === appId);
  assert(movedApp && previousApp, 'App Server must remain in the saved document');
  assert(
    movedApp.x !== previousApp.x || movedApp.y !== previousApp.y,
    'Dragging a node should persist its new canvas position.',
  );

  // The actual browser download and file import must round-trip without a server.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  const exportedText = await readFile(await download.path(), 'utf8');
  const exported = JSON.parse(exportedText);
  assert.equal(exported.format, 'archwise-sandbox');
  assert.equal(exported.nodes.length, 3);
  assert.equal(exported.connections.length, 2);

  await page.getByRole('button', { name: 'Clear canvas' }).click();
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__node').length === 0,
  );
  await page.locator('#sandbox-import').setInputFiles({
    name: 'archwise-sandbox-v1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedText),
  });
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__node').length === 3,
  );
  await page.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__edge').length === 2,
  );
  const imported = await waitForDocument(
    (doc) => doc.nodes.length === 3 && doc.connections.length === 2,
    'imported Sandbox autosaved',
  );
  assert.equal(imported.connections.length, 2);
  assert(imported.nodes.some((node) => node.label === 'SQL Primary'));
  assert.equal(imported.draft.replicas[appNodeId], 3);
  assert(imported.draft.savedA && imported.draft.savedB);

  // A new launch starts a fresh session; the previous one can be resumed as it was.
  await page.locator('.save-indicator').filter({ hasText: 'All changes saved' }).waitFor();
  const previous = await savedDocument();
  await page.close();
  await stopServer();
  await writeManifest('packages/shared/package.json', { name: '@smoke/shared' });
  const secondUrl = await startServer();
  const resumedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  resumedPage.on('pageerror', (error) => errors.push(error.message));
  await resumedPage.goto(secondUrl, { waitUntil: 'networkidle' });
  await resumedPage.getByRole('button', { name: 'Sandbox', exact: true }).click();
  assert.equal(
    await resumedPage.locator('.svelte-flow__node').count(),
    0,
    'A new launch must start with an empty Sandbox',
  );
  await resumedPage.getByRole('button', { name: 'Sessions' }).click();
  const panel = resumedPage.getByRole('dialog', { name: 'Sessions' });
  const row = panel.locator('.session-row').first();
  await row.waitFor();
  await row.getByText('A/B').waitFor();
  await row.getByText('Architecture changed').waitFor();
  await row.getByRole('button', { name: 'Resume' }).click();
  // Resuming reloads the graph but keeps the mode the person chose.
  await resumedPage.getByRole('button', { name: 'Sandbox', exact: true, pressed: true }).waitFor();
  await resumedPage.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__edge').length === 2,
  );
  await resumedPage.getByText('Architecture changed since this session started').waitFor();
  const resumed = await savedDocument(resumedPage);
  assert.deepEqual(resumed, previous, 'Resuming restores the saved Sandbox exactly');

  // Untrusted labels render as text, never as markup.
  const hostile = '<img src=x onerror=alert(1)>';
  await resumedPage.getByRole('button', { name: 'Sessions' }).click();
  const reopened = resumedPage.getByRole('dialog', { name: 'Sessions' });
  await reopened.locator('.session-row').first().getByRole('button', { name: 'Rename' }).click();
  await reopened.locator('.session-row input').fill(hostile);
  await reopened.getByRole('button', { name: 'Save' }).click();
  await reopened.getByText(hostile).waitFor();
  assert.equal(await reopened.locator('img').count(), 0, 'Session labels must not render HTML');

  // Deleting the open session switches to a fresh, empty session.
  await reopened.locator('.session-row').first().getByRole('button', { name: 'Delete' }).click();
  await reopened.getByRole('button', { name: 'Confirm delete' }).click();
  await resumedPage.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__node').length === 0,
  );
  await resumedPage.waitForTimeout(1500);
  assert.notEqual(
    await resumedPage.locator('.save-indicator').getAttribute('data-state'),
    'unsaved',
    'Deleting the open session must not leave failed saves',
  );

  // Switching sessions must never replay the last catalog addition into the next session.
  const countSessions = () =>
    resumedPage.evaluate(
      async () => (await (await fetch('/api/v1/sessions')).json()).sessions.length,
    );
  await resumedPage.getByRole('button', { name: 'Add Cache' }).click();
  await waitForDocument((doc) => doc.nodes.length === 1, 'cache added', resumedPage);
  const sessionsBefore = await countSessions();
  await resumedPage.getByRole('button', { name: 'Sessions' }).click();
  await resumedPage
    .getByRole('dialog', { name: 'Sessions' })
    .getByRole('button', { name: 'New session' })
    .click();
  await resumedPage.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__node').length === 0,
  );
  await resumedPage.waitForTimeout(1500);
  assert.equal(
    await resumedPage.locator('.svelte-flow__node').count(),
    0,
    'A new session must not replay the last catalog addition',
  );
  assert.equal(await countSessions(), sessionsBefore, 'An unedited new session must not persist');

  // An edit made just before "Refresh graph" is saved, not dropped.
  await resumedPage.getByRole('button', { name: 'Add Client' }).click();
  const freshInspector = resumedPage.getByRole('region', { name: 'Selected component properties' });
  await freshInspector.locator('#inspector-name').fill('Edge Client');
  await resumedPage.getByRole('button', { name: 'Refresh graph' }).click();
  await waitForDocument(
    (doc) => doc.nodes.length === 1 && doc.nodes[0].label === 'Edge Client',
    'edit before refresh saved',
    resumedPage,
  );

  // The Sessions panel works from the keyboard and returns focus on Escape.
  const sessionsButton = resumedPage.getByRole('button', { name: 'Sessions' });
  await sessionsButton.focus();
  await resumedPage.keyboard.press('Enter');
  const keyboardDialog = resumedPage.getByRole('dialog', { name: 'Sessions' });
  await keyboardDialog.waitFor();
  assert(
    await keyboardDialog.evaluate((el) => el.contains(globalThis.document.activeElement)),
    'Opening Sessions moves focus into the panel',
  );
  await resumedPage.keyboard.press('Escape');
  await keyboardDialog.waitFor({ state: 'detached' });
  assert.equal(
    await resumedPage.evaluate(() => globalThis.document.activeElement?.textContent?.trim()),
    'Sessions',
    'Closing Sessions returns focus to its button',
  );

  // A stored Sandbox that cannot be restored is never overwritten by later edits.
  await resumedPage.evaluate(async () => {
    const { id } = await (await fetch('/api/v1/sessions/current')).json();
    await fetch(`/api/v1/sessions/${id}/sandbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'archwise-sandbox',
        version: 1,
        projectSignature: 'foreign-project',
        nodes: [],
        connections: [],
        draft: {},
      }),
    });
  });
  await resumedPage.reload({ waitUntil: 'networkidle' });
  await resumedPage
    .locator('.save-indicator')
    .filter({ hasText: 'could not be restored' })
    .waitFor();
  await resumedPage.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await resumedPage.getByRole('button', { name: 'Add Worker' }).click();
  await resumedPage.waitForTimeout(1500);
  const untouched = await savedDocument(resumedPage);
  assert.equal(
    untouched.projectSignature,
    'foreign-project',
    'An unrestorable session must not be overwritten',
  );

  // Several repositories: one graph, repository labels on nodes, and the header scan summary.
  for (const [name, manifest] of [
    ['api', { name: '@smoke/api' }],
    ['web', { name: '@smoke/web', dependencies: { '@smoke/api': 'workspace:*' } }],
  ]) {
    await mkdir(join(multiRoot, name), { recursive: true });
    await writeFile(join(multiRoot, name, 'package.json'), JSON.stringify(manifest));
  }
  await stopServer();
  const multiUrl = await startServer([
    '--repo',
    join(multiRoot, 'api'),
    '--repo',
    join(multiRoot, 'web'),
    '--no-store',
  ]);
  const multiPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  multiPage.on('pageerror', (error) => errors.push(error.message));
  await multiPage.goto(multiUrl, { waitUntil: 'networkidle' });
  await multiPage.getByRole('button', { name: 'Explore', exact: true }).click();
  for (const [name, repository] of [
    ['@smoke/api', 'api'],
    ['@smoke/web', 'web'],
  ]) {
    await multiPage
      .locator('.svelte-flow__node')
      .filter({ hasText: name })
      .filter({ hasText: 'Library' })
      .filter({ hasText: repository })
      .waitFor();
  }
  await multiPage.waitForFunction(
    () => globalThis.document.querySelectorAll('.svelte-flow__edge').length >= 1,
  );
  await multiPage.locator('.topbar-workspace').getByText('2 repositories').waitFor();
  await multiPage.locator('.revision-chip > summary').click();
  const scanPanel = multiPage.getByRole('group', { name: 'Scan details' });
  await scanPanel.getByText('api: 1 manifest').waitFor();
  await scanPanel.getByText('web: 1 manifest').waitFor();
  // Libraries only: the Studio says so and opens on All packages.
  await multiPage.getByText('No frontends, services or infrastructure were recognized').waitFor();

  // A system project: the System view shows frontends, services and infrastructure.
  const { SYSTEM_FIXTURE, createFixture } = await import(
    pathToFileURL(join(process.cwd(), 'packages/test-fixtures/dist/index.js')).href
  );
  // A long package name and an unsupported Compose variant exercise truncation and Scan notes.
  const LONG_NAME =
    'demo-with-a-very-long-package-name-that-keeps-going-and-going-to-eighty-characters';
  const system = await createFixture({
    ...SYSTEM_FIXTURE,
    'examples/demo/package.json': SYSTEM_FIXTURE['examples/demo/package.json'].replace(
      '"demo"',
      `"${LONG_NAME}"`,
    ),
    'compose.prod.yaml': 'services:\n  api:\n    image: node:22\n',
  });
  try {
    await stopServer();
    const systemUrl = await startServer(['--path', system.root, '--no-store']);
    const systemPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    systemPage.on('pageerror', (error) => errors.push(error.message));
    systemPage.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    // The Studio never contacts anything but its own local server (fonts are bundled).
    const origin = new URL(systemUrl).origin;
    const remote = [];
    systemPage.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol !== 'data:' && url.origin !== origin) remote.push(request.url());
    });
    await systemPage.goto(systemUrl, { waitUntil: 'networkidle' });
    // First load: dark theme, Explore (the project has components), the bundled font.
    assert.equal(
      await systemPage.evaluate(() => globalThis.document.documentElement.dataset.theme),
      'dark',
    );
    await systemPage.getByRole('button', { name: 'Explore', exact: true, pressed: true }).waitFor();
    await systemPage.evaluate(() => globalThis.document.fonts.ready);
    assert.ok(
      await systemPage.evaluate(() => globalThis.document.fonts.check('13px "JetBrains Mono"')),
      'JetBrains Mono is loaded from the bundle',
    );
    assert.match(
      await systemPage.evaluate(
        () => globalThis.getComputedStyle(globalThis.document.body).fontFamily,
      ),
      /JetBrains Mono/,
    );
    await systemPage.getByRole('button', { name: 'Explore', exact: true }).click();
    const viewControl = systemPage.getByRole('group', { name: 'Graph view' });
    assert.equal(
      await viewControl.getByRole('button', { name: 'System' }).getAttribute('aria-pressed'),
      'true',
      'The System view is the default',
    );
    const canvasNodes = systemPage.locator('.svelte-flow__node');
    for (const label of ['@shop/web', '@shop/api', '@shop/worker', 'Stripe', 'BullMQ']) {
      await canvasNodes.filter({ hasText: label }).first().waitFor();
    }
    await canvasNodes.filter({ hasText: 'PostgreSQL' }).first().waitFor();
    assert.equal(
      await canvasNodes.filter({ hasText: '@shop/db' }).count(),
      0,
      'Libraries are hidden in the System view',
    );
    await systemPage.waitForFunction(
      () => globalThis.document.querySelectorAll('.svelte-flow__edge').length >= 6,
    );
    // After the automatic layout, the whole System view fits on screen.
    const viewport = await systemPage.locator('.svelte-flow').boundingBox();
    await systemPage.waitForFunction(
      () => {
        const pane = globalThis.document.querySelector('.svelte-flow')?.getBoundingClientRect();
        const boxes = [...globalThis.document.querySelectorAll('.svelte-flow__node')].map((n) =>
          n.getBoundingClientRect(),
        );
        return (
          pane !== undefined &&
          boxes.length >= 7 &&
          boxes.every(
            (b) =>
              b.left >= pane.left - 1 &&
              b.right <= pane.right + 1 &&
              b.top >= pane.top - 1 &&
              b.bottom <= pane.bottom + 1,
          )
        );
      },
      undefined,
      { timeout: 10_000 },
    );
    assert.ok(viewport, 'The canvas is visible');
    if (process.env.ARCHWISE_SMOKE_SCREENSHOT) {
      await systemPage.screenshot({ path: process.env.ARCHWISE_SMOKE_SCREENSHOT });
    }
    await canvasNodes.filter({ hasText: '@shop/api' }).first().click();
    const discoveredInspector = systemPage.getByRole('complementary', {
      name: 'Component inspector',
    });
    await discoveredInspector.getByText('Kind: Service').waitFor();
    await discoveredInspector.getByText('Compose services: api').waitFor();
    await viewControl.getByRole('button', { name: 'All packages' }).click();
    await canvasNodes.filter({ hasText: '@shop/db' }).first().waitFor();
    const scanNotesPanel = systemPage.getByRole('region', { name: 'Scan notes' });
    await scanNotesPanel.getByText('1 file not analyzed').waitFor();
    await scanNotesPanel.getByText('compose.prod.yaml').waitFor();
    await scanNotesPanel.getByText('not analyzed: not supported yet').waitFor();

    // Both themes, two sizes, for review; the theme survives a reload.
    const shots = process.env.ARCHWISE_SMOKE_SCREENSHOT_DIR;
    const shoot = async (name) => {
      if (shots) await systemPage.screenshot({ path: join(shots, `${name}.png`) });
    };
    await systemPage.setViewportSize({ width: 1600, height: 950 });
    await shoot('studio-dark-1600');
    await systemPage.getByRole('button', { name: 'Switch to light theme' }).click();
    assert.equal(
      await systemPage.evaluate(() => globalThis.document.documentElement.dataset.theme),
      'light',
    );
    await systemPage.reload({ waitUntil: 'networkidle' });
    assert.equal(
      await systemPage.evaluate(() => globalThis.document.documentElement.dataset.theme),
      'light',
      'The theme choice survives a reload',
    );
    await shoot('studio-light-1600');

    // 1024 x 768: no horizontal scroll even with an 80-character name; the inspector is a drawer.
    await systemPage.setViewportSize({ width: 1024, height: 768 });
    await systemPage.getByRole('button', { name: 'All packages' }).click();
    await canvasNodes.filter({ hasText: 'demo-with-a-very-long' }).first().waitFor();
    assert.ok(
      await systemPage.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
      'No horizontal page scroll at 1024 px',
    );
    const inspector = systemPage.getByRole('complementary', { name: 'Component inspector' });
    assert.equal(await inspector.isVisible(), false, 'The inspector is a closed drawer at 1024 px');
    const focusedName = () =>
      systemPage.evaluate(() => {
        const el = globalThis.document.activeElement;
        return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? null;
      });
    await systemPage.getByRole('button', { name: 'Show inspector' }).click();
    await inspector.waitFor();
    assert.equal(await focusedName(), 'Close inspector', 'Opening a drawer moves focus into it');
    assert.ok(
      await systemPage.evaluate(
        () => globalThis.document.querySelector('.workspace')?.inert === true,
      ),
      'The canvas behind an open drawer is inert',
    );
    await shoot('studio-light-1024-drawer');
    await systemPage.keyboard.press('Escape');
    await inspector.waitFor({ state: 'hidden' });
    assert.equal(
      await focusedName(),
      'Show inspector',
      'Closing a drawer returns focus to its toggle',
    );
    await systemPage.getByRole('button', { name: 'Show components' }).click();
    assert.equal(await focusedName(), 'Close components', 'The components drawer takes focus too');
    await systemPage.getByRole('button', { name: 'Close components' }).click();
    assert.equal(await focusedName(), 'Show components');

    // The top bar never hides the chip or the theme toggle, and the chip is never cut off.
    for (const width of [1024, 600]) {
      await systemPage.setViewportSize({ width, height: 768 });
      const bar = await systemPage.evaluate(() => {
        const rect = (selector) =>
          globalThis.document.querySelector(selector)?.getBoundingClientRect();
        const chip = globalThis.document.querySelector('.revision-chip > summary');
        return {
          chipCut: chip ? chip.scrollWidth > chip.clientWidth + 1 : true,
          chipRight: rect('.revision-chip')?.right ?? Infinity,
          themeRight: rect('.topbar-theme')?.right ?? Infinity,
          themeWidth: rect('.topbar-theme')?.width ?? 0,
          inner: globalThis.innerWidth,
        };
      });
      assert.equal(bar.chipCut, false, `The revision chip is not truncated at ${width} px`);
      assert.ok(
        bar.chipRight <= bar.inner && bar.themeRight <= bar.inner && bar.themeWidth > 0,
        `Top bar fits at ${width} px`,
      );
    }
    await systemPage.setViewportSize({ width: 1024, height: 768 });
    await systemPage.getByRole('button', { name: 'Switch to dark theme' }).click();
    await shoot('studio-dark-1024');
    assert.deepEqual(remote, [], 'The Studio makes no request outside its local server');
  } finally {
    await system.dispose();
  }

  assert.deepEqual(errors, [], 'Browser runtime errors must not occur');
  console.log(
    'Browser smoke passed: components, handles, edge intent, replica scaling, A/B, autosave, drag positions, JSON export/import, reload, cross-launch resume, rename, delete, no catalog replay, edit-before-refresh, keyboard panel, unrestorable-session protection, a two-repository workspace with repository labels and the scan summary, the System view of a full-stack fixture, both themes with persistence, the bundled font, Scan notes, the 1024 px drawer layout and no remote requests.',
  );
} finally {
  await browser?.close();
  runner?.kill('SIGTERM');
  await rm(fixtureRoot, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  await rm(multiRoot, { recursive: true, force: true });
}
