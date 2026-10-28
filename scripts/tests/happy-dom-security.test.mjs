import assert from 'node:assert/strict';
import { get, createServer } from 'node:http';
import test from 'node:test';
import { Window } from 'happy-dom';

// Run from a repository containing happy-dom, e.g. after copying this file into
// scripts/: node --test scripts/happy-dom-security.test.mjs
// These tests never change global browser settings or enable external loading.
// Primary sources for the v21 security contract and public lifecycle API:
// https://github.com/capricorn86/happy-dom/releases/tag/v21.0.0
// https://github.com/capricorn86/happy-dom/blob/v21.0.4/packages/happy-dom/src/browser/DefaultBrowserSettings.ts
// https://github.com/capricorn86/happy-dom/blob/v21.0.4/packages/happy-dom/src/window/DetachedWindowAPI.ts
// https://github.com/capricorn86/happy-dom/security/advisories/GHSA-c8p4-j97h-3vg8

async function createLoopbackFixture() {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    // Respond promptly even if a regression causes an unexpected request.
    // No external hosts, application services, credentials or private data.
    if (request.url?.endsWith('.css')) {
      response.writeHead(200, { 'Content-Type': 'text/css' });
      response.end('body { color: rgb(99, 88, 77); }');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><p>Loopback resource fixture</p>');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function probeLoopback(url) {
  // Positive control for the HTTP counter; does not enable Happy DOM loaders.
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      response.on('error', reject);
      response.resume();
      response.on('end', resolve);
    });
    request.on('error', reject);
    request.setTimeout(2_000, () => request.destroy(new Error('Loopback probe timed out')));
  });
}

test('untrusted markup and appended resources cannot fetch CSS or iframe URLs by default', { timeout: 10_000 }, async () => {
  const fixture = await createLoopbackFixture();
  let window;
  try {
    await probeLoopback(`${fixture.origin}/counter-probe`);
    assert.deepEqual(fixture.requests, ['/counter-probe'], 'the local server must be reachable and count requests');
    fixture.requests.length = 0;

    // Intentionally omit settings: this exercises the shipped secure defaults.
    // Same-origin loopback URLs make this independent of CORS or DNS failures.
    window = new Window({ url: `${fixture.origin}/document` });
    window.document.write(`<!doctype html><html><head>
      <link rel="stylesheet" href="${fixture.origin}/parsed.css">
      </head><body><iframe src="${fixture.origin}/parsed-frame"></iframe></body></html>`);
    await window.happyDOM.whenAsyncComplete();

    assert.equal(window.document.querySelectorAll('link[rel="stylesheet"]').length, 1, 'the CSS payload was parsed');
    assert.equal(window.document.querySelectorAll('iframe').length, 1, 'the iframe payload was parsed');
    assert.deepEqual(fixture.requests, [], 'parsing attacker-controlled resource tags must not send HTTP requests');
    assert.equal(window.document.querySelector('link').sheet, null, 'external CSS must not be applied');

    const stylesheet = window.document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = `${fixture.origin}/appended.css`;
    const iframe = window.document.createElement('iframe');
    iframe.src = `${fixture.origin}/appended-frame`;
    window.document.head.append(stylesheet);
    window.document.body.append(iframe);
    await window.happyDOM.whenAsyncComplete();

    assert.equal(stylesheet.isConnected, true);
    assert.equal(iframe.isConnected, true);
    assert.deepEqual(fixture.requests, [], 'connecting resource elements must also preserve the SSRF boundary');
    assert.equal(stylesheet.sheet, null);
    // Secondary checks provide a useful diagnosis if the behavior regresses.
    assert.equal(window.happyDOM.settings.enableCSSFileLoading, false);
    assert.equal(window.happyDOM.settings.enableIframePageLoading, false);
  } finally {
    try {
      if (window) await window.happyDOM.close();
    } finally {
      await fixture.close();
    }
  }
});

test('secure resource defaults preserve form submission, bubbling events, mutations and inline CSS', { timeout: 5_000 }, async () => {
  const window = new Window();
  try {
    const { document } = window;
    document.body.innerHTML = `<form>
      <label>Reference <input name="reference" required></label>
      <label><input name="approved" type="checkbox" value="yes" checked> Approved</label>
      <button type="submit">Save</button>
      <output id="status" aria-live="polite"></output>
    </form>`;
    const form = document.querySelector('form');
    const input = form.querySelector('input[name="reference"]');
    const output = form.querySelector('output');
    const style = document.createElement('style');
    style.textContent = '#status { color: rgb(12, 34, 56); }';
    document.head.append(style);

    const mutations = [];
    const observer = new window.MutationObserver((records) => mutations.push(...records));
    observer.observe(output, { childList: true, subtree: true, characterData: true });
    let inputEvents = 0;
    let submitEvents = 0;
    document.addEventListener('input', (event) => {
      if (event.target === input) inputEvents += 1;
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitEvents += 1;
      output.textContent = `Saved ${input.value}`;
    });

    assert.equal(form.checkValidity(), false, 'required input validation remains active');
    input.value = 'LIFT-123';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(form.checkValidity(), true);
    form.querySelector('button').click();
    await window.happyDOM.whenAsyncComplete();

    assert.equal(inputEvents, 1, 'UI events still bubble to delegated listeners');
    assert.equal(submitEvents, 1, 'button activation still submits a valid form');
    assert.equal(output.textContent, 'Saved LIFT-123');
    assert.deepEqual(Object.fromEntries(new window.FormData(form)), { reference: 'LIFT-123', approved: 'yes' });
    assert.ok(mutations.some((record) => record.type === 'childList'), 'DOM changes still notify mutation observers');
    assert.equal(window.getComputedStyle(output).color, 'rgb(12, 34, 56)', 'inline CSS remains available without external loading');
    observer.disconnect();
  } finally {
    await window.happyDOM.close();
  }
});
