// Heliox screenshot script — uses headless Chrome via CDP (no deps).
// Usage:  node tools/screenshot.mjs            # desktop pass
//         node tools/screenshot.mjs mobile     # mobile pass
//         node tools/screenshot.mjs all        # both

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INDEX_URL = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'screenshots');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const USER_DATA = '/tmp/heliox-shots-profile-' + Date.now();

const VIEWS = [
  { name: '01-home',                       hash: '#/home' },
  { name: '02-dashboard',                  hash: '#/dashboard' },
  { name: '03-project-pixel2-preview',     hash: '#/project/pixel-2' },
  { name: '04-project-pixel2-tasks',       hash: '#/project/pixel-2', cv: 'tasks' },
  { name: '05-project-pixel2-graph',       hash: '#/project/pixel-2', cv: 'graph' },
  { name: '06-project-pixel2-deliveries',  hash: '#/project/pixel-2', cv: 'deliveries' },
  { name: '07-project-pixel2-memory',      hash: '#/project/pixel-2', cv: 'memory' },
  { name: '08-project-pixel2-activity',    hash: '#/project/pixel-2', cv: 'activity' },
  { name: '09-project-pixel2-editor',      hash: '#/project/pixel-2', cv: 'editor' },
  { name: '10-project-pixel2-inspect',     hash: '#/project/pixel-2', cv: 'inspect' },
  { name: '11-project-pixel2-mention',     hash: '#/project/pixel-2', mention: true },
  { name: '12-agent-aria',                 hash: '#/agent/aria' },
  { name: '13-settings',                   hash: '#/settings' },
  { name: '14-new-project-modal',          hash: '#/home', modal: true },
  { name: '15-plugins-installed',          hash: '#/plugins' },
  { name: '16-plugins-sources',            hash: '#/plugins', extTab: 'sources' },
  { name: '17-integrations-mcp',           hash: '#/integrations' },
  { name: '18-integrations-connectors',    hash: '#/integrations', extTab: 'conn' },
  { name: '19-integrations-anywhere',      hash: '#/integrations', extTab: 'ua' },
];

const MOBILE_VIEWS = [
  { name: 'm-01-home',                hash: '#/home' },
  { name: 'm-02-dashboard',           hash: '#/dashboard' },
  { name: 'm-03-project-pixel2',      hash: '#/project/pixel-2' },
  { name: 'm-04-project-pixel2-tasks',hash: '#/project/pixel-2', cv: 'tasks' },
  { name: 'm-05-agent-aria',          hash: '#/agent/aria' },
  { name: 'm-06-plugins',             hash: '#/plugins' },
  { name: 'm-07-integrations',        hash: '#/integrations' },
];

const mode = process.argv[2] || 'desktop';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

console.log('launching chrome ...');
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${USER_DATA}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--mute-audio',
  '--window-size=1500,940',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', () => {}); // silence noisy chrome stderr

async function waitDevtools() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('chrome devtools never came up');
}
await waitDevtools();
console.log('chrome ready');

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const tab = targets.find(t => t.type === 'page') || targets[0];
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let msgId = 0;
const pending = new Map();
const eventListeners = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error)));
    else resolve(m.result);
  } else if (m.method) {
    const set = eventListeners.get(m.method);
    if (set) for (const fn of [...set]) fn(m.params);
  }
});

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
function onEvent(method, fn) {
  if (!eventListeners.has(method)) eventListeners.set(method, new Set());
  eventListeners.get(method).add(fn);
  return () => eventListeners.get(method).delete(fn);
}
function waitEvent(method, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { off(); reject(new Error('timeout ' + method)); }, timeoutMs);
    const off = onEvent(method, (params) => {
      if (predicate(params)) { clearTimeout(t); off(); resolve(params); }
    });
  });
}

await cdp('Page.enable');
await cdp('Runtime.enable');

async function runPass(views, viewport, scale = 2) {
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: viewport.w, height: viewport.h, deviceScaleFactor: scale,
    mobile: viewport.mobile === true,
  });
  for (const v of views) {
    const url = INDEX_URL + v.hash;
    const loadP = waitEvent('Page.loadEventFired', () => true, 6000).catch(() => {});
    await cdp('Page.navigate', { url });
    await loadP;
    // give layout + JS render a beat
    await sleep(700);
    if (v.cv) {
      await cdp('Runtime.evaluate', {
        expression: `document.querySelector('.canvas-bar .cv-tab[data-tab="${v.cv}"]')?.click();`,
      });
      await sleep(500);
    }
    if (v.extTab) {
      await cdp('Runtime.evaluate', {
        expression: `document.querySelector('.ext-tab[data-tab="${v.extTab}"]:not([data-disabled="true"])')?.click();`,
      });
      await sleep(400);
    }
    if (v.mention) {
      await cdp('Runtime.evaluate', {
        expression: `document.getElementById('mention-btn')?.click();`,
      });
      await sleep(450);
    }
    if (v.modal) {
      await cdp('Runtime.evaluate', {
        expression: `(typeof openNewProj==='function') && openNewProj('为 Pixel 2.0 写一份 Q3 设计系统迁移交付报告');`,
      });
      await sleep(450);
    }
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(OUT, `${v.name}.png`);
    await writeFile(file, Buffer.from(shot.data, 'base64'));
    console.log('  saved', path.basename(file));
    // Close any modal/rail/mention residual state — hash-only navigation does not reload.
    await cdp('Runtime.evaluate', {
      expression: `(typeof closeModal==='function') && closeModal(); document.getElementById('rail')?.classList.remove('on'); document.getElementById('mention-pop')?.classList.remove('on');`,
    });
  }
}

try {
  if (mode === 'desktop' || mode === 'all') {
    console.log('desktop pass (1440 x 900) ...');
    await runPass(VIEWS, { w: 1440, h: 900, mobile: false }, 2);
  }
  if (mode === 'mobile' || mode === 'all') {
    console.log('mobile pass (390 x 844) ...');
    await runPass(MOBILE_VIEWS, { w: 390, h: 844, mobile: true }, 3);
  }
} finally {
  ws.close();
  chrome.kill('SIGTERM');
}

console.log('done →', OUT);
