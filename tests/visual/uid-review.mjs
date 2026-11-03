import { chromium as playwright } from "playwright";
import chromium from "@sparticuz/chromium";
import assert from "node:assert/strict";
const browser = await playwright.launch({
  executablePath: await chromium.executablePath(),
  args: chromium.args.filter(
    (a) => a !== "--single-process" && a !== "--disable-web-security",
  ),
  headless: true,
});
const owner = "11111111-2222-4333-8444-555555555555";
const errors = [];
try {
  for (const width of [320, 360, 390, 768, 1440])
    for (const lang of ["ar", "en"]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.addInitScript(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (value) => {
              window.__copied = value;
            },
          },
        }),
      );
      await page.goto(`http://127.0.0.1:4173/?screen=wallet&lang=${lang}`);
      const panel = page.locator(".receiving-identity-panel");
      await panel.locator(".receiving-uid").waitFor();
      assert.equal(
        await panel.locator(".receiving-uid").innerText(),
        "1234 5678 97",
      );
      await panel.locator(".receiving-uid-actions button").first().click();
      assert.equal(await page.evaluate(() => window.__copied), "1234567897");
      await panel.getByRole("button", { name: "QR", exact: true }).click();
      assert(await panel.locator(".receiving-uid-qr svg").isVisible());
      const layout = await page.evaluate(() => ({
        w: innerWidth,
        s: document.documentElement.scrollWidth,
      }));
      assert(layout.s <= layout.w + 1);
      await page.goto(
        `http://127.0.0.1:4173/?screen=settings&lang=${lang}#profile`,
      );
      await page.locator(".receiving-profile-form").waitFor();
      const username = page.locator(".receiving-profile-form input").nth(1);
      assert(
        await username.isDisabled(),
        "Existing username must be immutable",
      );
      let saved;
      await page.route("**/api/account/receiving-identity", async (route) => {
        if (route.request().method() === "POST") {
          saved = route.request().postDataJSON();
          await route.fulfill({ json: { ok: true } });
        } else await route.continue();
      });
      await page
        .locator(".receiving-profile-form input")
        .first()
        .fill("اسم اختبار جديد");
      await page.locator(".receiving-profile-form button").click();
      await page.waitForFunction(
        () => document.querySelector(".receiving-profile-form input")?.value,
      );
      assert.deepEqual(saved, {
        displayName: "اسم اختبار جديد",
        username: "fixture_owner",
      });
      const after = await page.evaluate(() => ({
        w: innerWidth,
        s: document.documentElement.scrollWidth,
      }));
      assert(after.s <= after.w + 1);
      if (width === 390)
        await page.screenshot({
          path: `.cache/visual-wallet/screenshots/uid-profile-${lang}.png`,
          fullPage: true,
          animations: "disabled",
        });
      await page.close();
    }
  // A wrong-owner response is not allowed to display a previous or different UID.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/api/account/receiving-identity", (route) =>
    route.fulfill({
      json: { userId: "foreign-owner", identity: { uid: "1234567897" } },
    }),
  );
  await page.goto("http://127.0.0.1:4173/?screen=wallet&lang=en");
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
  assert.equal(await page.locator(".receiving-uid").count(), 0);
  await page.close();
  assert.deepEqual(errors, []);
  console.log(
    "UID browser PASS: 10 bilingual wallet/profile flows at five widths, exact copy, QR, immutable username, owner-bound profile update without client owner/UID fields, no overflow, foreign-owner denial. No payment approval.",
  );
} finally {
  await browser.close();
}
