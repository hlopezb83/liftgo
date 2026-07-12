import { chromium } from 'playwright';
import fs from 'fs';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
];

const routes = ['/', '/mrr'];

async function audit() {
  const browser = await chromium.launch({ executablePath: '/bin/chromium' });
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;

  if (!storageKey || !sessionJson) {
    console.error("Missing Supabase session environment variables.");
    process.exit(1);
  }

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });

    const page = await context.newPage();

    // Set Supabase session
    await page.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, value);
    }, { key: storageKey, value: sessionJson });

    for (const route of routes) {
      const url = `http://localhost:8080${route}`;
      console.log(`Auditing ${url} at ${viewport.name} (${viewport.width}x${viewport.height})...`);
      
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        // Wait a bit more for charts and animations
        await page.waitForTimeout(5000);

        const dir = `/tmp/browser/dashboard/${viewport.name}`;
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const fileName = route === '/' ? 'home' : route.replace(/\//g, '_').substring(1);
        const screenshotPath = `${dir}/${fileName}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Audit checks
        const auditResults = await page.evaluate(() => {
          const results = [];
          
          // 1. Horizontal Overflow
          if (document.documentElement.scrollWidth > window.innerWidth) {
            results.push({
              severity: 'CRITICAL',
              issue: 'Horizontal overflow detected',
              details: `Scroll width: ${document.documentElement.scrollWidth}, Viewport width: ${window.innerWidth}`
            });
          }

          // 2. Pie Charts dimensions
          const pieCharts = document.querySelectorAll('.recharts-responsive-container');
          pieCharts.forEach((chart, index) => {
            const rect = chart.getBoundingClientRect();
            if (rect.height === 0 || rect.width === 0) {
              results.push({
                severity: 'CRITICAL',
                issue: `Pie chart ${index + 1} has 0 dimensions`,
                details: `Height: ${rect.height}, Width: ${rect.width}`
              });
            }
          });

          // 3. Sidebar overlap (check if main content is covered)
          const sidebar = document.querySelector('aside, [role="navigation"]');
          const main = document.querySelector('main');
          if (sidebar && main) {
            const sRect = sidebar.getBoundingClientRect();
            const mRect = main.getBoundingClientRect();
            // In desktop/landscape, sidebar should usually be side-by-side. 
            // In portrait, it might be an overlay, which is fine if toggled.
            // But if they overlap and sidebar is NOT hidden...
            if (sRect.width > 0 && sRect.right > mRect.left && window.innerWidth > 768) {
               // This is a heuristic, might need tuning
               // results.push({ severity: 'WARNING', issue: 'Sidebar might be overlapping main content' });
            }
          }

          // 4. KPI tiles
          const kpis = document.querySelectorAll('.grid > div'); // Rough heuristic for KPI tiles
          kpis.forEach(kpi => {
             const rect = kpi.getBoundingClientRect();
             if (rect.width < 50 && rect.height > 100) {
               results.push({ severity: 'WARNING', issue: 'KPI tile seems collapsed', details: `Width: ${rect.width}` });
             }
          });

          return results;
        });

        if (auditResults.length > 0) {
          console.log(JSON.stringify({ route, viewport: viewport.name, screenshotPath, issues: auditResults }, null, 2));
        } else {
          console.log(`No major issues detected on ${route} at ${viewport.name}. Screenshot: ${screenshotPath}`);
        }

      } catch (err) {
        console.error(`Failed to audit ${url}: ${err.message}`);
      }
    }
    await context.close();
  }

  await browser.close();
}

audit();
