import { chromium } from '@playwright/test';

async function audit() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 1024, height: 768 }
  ];

  const routes = [
    { name: 'customers', url: 'http://localhost:8080/customers', cta: 'Nuevo cliente', isDialog: true },
    { name: 'quotes', url: 'http://localhost:8080/quotes/new', isDialog: false },
    { name: 'bookings', url: 'http://localhost:8080/bookings/new', isDialog: false },
    { name: 'forklifts', url: 'http://localhost:8080/fleet/new', isDialog: false },
    { name: 'maintenance', url: 'http://localhost:8080/maintenance', cta: 'Nuevo servicio', isDialog: true },
    { name: 'suppliers', url: 'http://localhost:8080/suppliers', cta: 'Nuevo proveedor', isDialog: true }
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    
    for (const route of routes) {
      console.log(`Auditing ${route.name} on ${vp.name}...`);
      await page.goto(route.url);
      await page.waitForLoadState('networkidle');

      // Check if we are at login
      const loginHeading = await page.getByRole('heading', { name: 'Iniciar Sesión' }).isVisible();
      if (loginHeading) {
        console.log(`Redirected to login on ${route.name}`);
        await page.screenshot({ path: `/tmp/browser/forms/auth_required_${vp.name}.png` });
        continue;
      }

      if (route.isDialog && route.cta) {
        try {
          // Look for the CTA. Some pages use usePageActions which might render a button in a header or a FAB.
          const button = page.getByRole('button', { name: route.cta, exact: false }).first();
          if (await button.isVisible()) {
            await button.click();
            // Wait for dialog
            await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
            await page.waitForTimeout(500); // Animation
          } else {
             // Try FAB for mobile/tablet if not found
             const fab = page.locator('button[aria-label*="Agregar"], button[aria-label*="Nuevo"]').first();
             if (await fab.isVisible()) {
                await fab.click();
                await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
                await page.waitForTimeout(500);
             }
          }
        } catch (e) {
          console.error(`Could not open dialog for ${route.name}: ${e.message}`);
        }
      }

      await page.screenshot({ path: `/tmp/browser/forms/${route.name}_${vp.name}.png`, fullPage: !route.isDialog });
    }
  }

  await browser.close();
}

audit().catch(console.error);
