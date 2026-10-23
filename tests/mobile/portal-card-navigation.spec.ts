import { expect, type Locator, type Page } from "@playwright/test";
import { test, fitsViewport, noHorizontalOverflow } from "./mobileTest";
import { portalInvoices, portalQuotes } from "./offlineDispatcher";

test.use({ profile: "portal" });

// Traverse the browser's real sequential tab order. locator.focus() would
// falsely pass a DIV with tabindex=-1 and does not test keyboard discovery.
async function tabTo(page: Page, target: Locator) {
  for (let tabs = 0; tabs < 20; tabs++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement))
      break;
  }
  await expect(target).toBeFocused();
}

const lists = [
  {
    path: "/portal/invoices",
    title: "Mis Facturas",
    read: "get_portal_invoices_page",
    items: portalInvoices.map((row) => ({
      id: row.id,
      number: row.invoice_number,
    })),
  },
  {
    path: "/portal/quotes",
    title: "Mis Cotizaciones",
    read: "quotes",
    items: portalQuotes.map((row) => ({
      id: row.id,
      number: row.quote_number,
    })),
  },
];

for (const list of lists) {
  test(`${list.title}: Tab, Shift+Tab, Enter, Atrás y tap sobre enlaces reales`, async ({
    page,
    mockBackend,
  }, info) => {
    await page.goto(list.path);
    const main = page.getByRole("main");
    const cards = list.items.map((row) =>
      main.getByRole("link", { name: new RegExp(row.number) }),
    );
    await expect(
      page.getByRole("heading", { name: list.title, exact: true }),
    ).toBeVisible();
    for (const [index, card] of cards.entries()) {
      await expect(card).toHaveAttribute(
        "href",
        `${list.path}/${list.items[index].id}`,
      );
      await fitsViewport(page, card);
      await expect(card).toContainText(
        new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: index === 0 ? "MXN" : "USD",
        }).format(1160),
      );
    }
    await noHorizontalOverflow(page);
    expect(
      await main.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    expect(mockBackend.observed.has(list.read)).toBe(true);

    const unfocusedShadow = await cards[0].evaluate(
      (element) => getComputedStyle(element).boxShadow,
    );
    await tabTo(page, cards[0]);
    await page.keyboard.press("Tab");
    await expect(cards[1]).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cards[0]).toBeFocused();
    // Verify the actual computed focus indicator, not just a Tailwind class.
    expect(
      await cards[0].evaluate((element) => element.matches(":focus-visible")),
    ).toBe(true);
    await expect(cards[0]).not.toHaveCSS("box-shadow", unfocusedShadow);
    // The card contract is a 2px ring outside a 2px offset. Tailwind can emit
    // zero/transparent shadow layers, so `box-shadow !== none` is insufficient.
    const ringShadow = await cards[0].evaluate(
      (element) =>
        getComputedStyle(element)
          .boxShadow.split(/,(?![^(]*\))/)
          .find((shadow) => /0px 0px 0px 4px/.test(shadow)) ?? "",
    );
    expect(ringShadow).not.toBe("");
    expect(ringShadow).not.toMatch(
      /transparent|rgba\([^)]*,\s*0(?:\.0+)?\s*\)|\/\s*0(?:\.0+)?%?\s*\)/,
    );
    await page.screenshot({
      path: info.outputPath("portal-list-keyboard-focus.png"),
      fullPage: true,
    });

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`${list.path}/${list.items[0].id}/?$`),
    );
    await expect(
      page.getByRole("heading", { name: list.items[0].number, exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${list.path}/?$`));
    await expect(cards[0]).toBeVisible();

    // A second keyboard navigation must select the second record, not a
    // stale closure. Back/Forward then replays that same real route.
    await tabTo(page, cards[0]);
    await page.keyboard.press("Tab");
    await expect(cards[1]).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`${list.path}/${list.items[1].id}/?$`),
    );
    await expect(
      page.getByRole("heading", { name: list.items[1].number, exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(cards[1]).toBeVisible();
    await page.goForward();
    await expect(
      page.getByRole("heading", { name: list.items[1].number, exact: true }),
    ).toBeVisible();
    await page.goBack();
    await cards[0].tap();
    await expect(
      page.getByRole("heading", { name: list.items[0].number, exact: true }),
    ).toBeVisible();
    await page.goBack();
    await page.reload();
    await expect(cards[0]).toBeVisible();
    await expect(cards[1]).toBeVisible();
    await noHorizontalOverflow(page);
  });
}
