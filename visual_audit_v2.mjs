import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const baseUrl = 'http://localhost:8080';
const outputDir = '/tmp/browser/audit-1600';
const routes = [
  '/',
  '/calendario',
  '/flota',
  '/equipos',
  '/mantenimiento',
  '/ventas/cotizaciones',
  '/ventas/reservas',
  '/facturacion/facturas',
  '/compras/facturas-proveedor',
  '/clientes',
  '/reportes',
  '/mrr',
  '/usuarios',
  '/actividad'
];

async function run() {
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/bin/chromium'
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 }
  });

  // Restore session
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
  if (cookiesJson) {
    const cookies = JSON.parse(cookiesJson);
    await context.addCookies(cookies);
  }

  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;

  const page = await context.newPage();

  if (sessionJson && storageKey) {
    await page.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, value);
    }, { key: storageKey, value: sessionJson });
  }

  const auditResults = [];

  for (const route of routes) {
    const url = `${baseUrl}${route}`;
    console.log(`Visiting ${url}...`);
    const consoleLogs = [];
    page.on('console', msg => {
      if (!msg.text().includes('Incorrect locale information provided')) {
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      if (response && response.status() === 404) {
        console.warn(`404 at ${route}`);
        auditResults.push({ route, status: 404 });
        continue;
      }

      // Wait a bit for any animations or late rendering
      await page.waitForTimeout(3000);

      const filenameBase = route.replace(/\//g, '_') || 'index';
      // Remove leading underscore if present
      const cleanFilename = filenameBase.startsWith('_') ? filenameBase.substring(1) : filenameBase;
      const screenshotPath = path.join(outputDir, `${cleanFilename}.png`);
      await page.screenshot({ path: screenshotPath });

      // Look for toolbar/filters
      // Heuristic: div containing filters or search
      const toolbarSelector = '.flex.items-center.justify-between, .flex.flex-col.md\\:flex-row, .bg-card .flex.gap-4'; 
      const toolbars = await page.$$(toolbarSelector);
      let toolbarScreenshotPath = null;
      if (toolbars.length > 0) {
        // Find one that looks like a toolbar (has buttons/inputs)
        for (const tb of toolbars) {
          const hasInput = await tb.$('input, button');
          if (hasInput) {
            toolbarScreenshotPath = path.join(outputDir, `${cleanFilename}_toolbar.png`);
            await tb.screenshot({ path: toolbarScreenshotPath });
            break;
          }
        }
      }

      // Visual Analysis (heuristic)
      const visualFindings = await page.evaluate(() => {
        const findings = [];
        // Check horizontal overflow
        if (document.documentElement.scrollWidth > window.innerWidth) {
          findings.push("Overflow horizontal detectado");
        }
        // Check for common layout issues
        const tables = document.querySelectorAll('table');
        tables.forEach(t => {
           if (t.offsetWidth < 500 && window.innerWidth > 1000) {
             // findings.push("Tabla con ancho muy reducido");
           }
        });
        
        // Check for badges with potentially low contrast (heuristic)
        const badges = document.querySelectorAll('.badge, [class*="badge"]');
        // (Just a placeholder for now, hard to automate perfectly)
        
        return findings;
      });

      auditResults.push({
        route,
        status: 200,
        screenshotPath,
        toolbarScreenshotPath,
        consoleLogs,
        visualFindings
      });
    } catch (error) {
      console.error(`Error visiting ${route}: ${error.message}`);
      auditResults.push({ route, status: 'error', error: error.message });
    }
  }

  fs.writeFileSync(path.join(outputDir, 'audit_results.json'), JSON.stringify(auditResults, null, 2));
  await browser.close();
  console.log('Audit complete.');
}

run().catch(console.error);
