import path from 'path';
import { chromium } from 'playwright';

const PAGES = ['/fleet', '/maintenance', '/suppliers'];
const RESOLUTIONS = [{ width: 1024, height: 768, name: 'tablet' }];

async function runAudit() {
  const browser = await chromium.launch({
    executablePath: '/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;

  const context = await browser.newContext({ viewport: RESOLUTIONS[0] });
  const page = await context.newPage();

  if (storageKey && sessionJson) {
    await page.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, value);
    }, { key: storageKey, value: sessionJson });
  }

  for (const urlPath of PAGES) {
    try {
      await page.goto(`http://localhost:8080${urlPath}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      const filename = `${urlPath.replace(/\//g, '_')}_tablet.png`.replace(/^_/, '');
      await page.screenshot({ path: path.join('/tmp/browser/lists', filename), fullPage: true });
    } catch (e) {}
  }
  await browser.close();
}
runAudit();
