import { chromium, type Browser, type Page } from 'playwright';
import fs from 'fs';
import path from 'path';

const PAGES = [
  '/customers',
  '/quotes',
  '/bookings',
  '/invoices',
  '/fleet',
  '/maintenance',
  '/suppliers'
];

const RESOLUTIONS = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 1024, height: 768, name: 'tablet' }
];

async function runAudit() {
  const browser = await chromium.launch({
    executablePath: '/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;

  for (const res of RESOLUTIONS) {
    const context = await browser.newContext({
      viewport: { width: res.width, height: res.height }
    });

    const page = await context.newPage();

    // Set session in localStorage
    if (storageKey && sessionJson) {
      await page.addInitScript(({ key, value }) => {
        window.localStorage.setItem(key, value);
      }, { key: storageKey, value: sessionJson });
    }

    for (const urlPath of PAGES) {
      console.log(`Auditing ${urlPath} at ${res.width}x${res.height}...`);
      try {
        await page.goto(`http://localhost:8080${urlPath}`, { waitUntil: 'networkidle', timeout: 30000 });
        // Wait a bit more for any animations or late loading data
        await page.waitForTimeout(3000);
        
        const filename = `${urlPath.replace(/\//g, '_')}_${res.name}.png`.replace(/^_/, '');
        const filePath = path.join('/tmp/browser/lists', filename);
        await page.screenshot({ path: filePath, fullPage: true });
        console.log(`Saved screenshot: ${filePath}`);
      } catch (error) {
        console.error(`Failed to audit ${urlPath}:`, error);
      }
    }
    await context.close();
  }

  await browser.close();
}

runAudit().catch(console.error);
