import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { PlatformPreview } from "../components/platform-preview";
import { FinancialActivity } from "../components/financial-activity";
import { FinancialState, FinancialEmpty } from "../components/financial-ui";
import { AccountNavigation } from "../components/account-navigation";
async function main() {
  for (const ar of [true, false]) {
    const preview = renderToStaticMarkup(<PlatformPreview ar={ar} />);
    assert(
      preview.includes(
        ar ? "دون بيانات مالية فعلية" : "No real financial data",
      ),
    );
    assert.equal((preview.match(/aria-pressed="true"/g) ?? []).length, 1);
    assert(!/\$[0-9]|Visa|Mastercard|APY|APR/.test(preview));
    const activity = renderToStaticMarkup(
      <FinancialActivity
        ar={ar}
        hideBalance
        status={{
          enabled: true,
          userId: "alice",
          balance: { posted: "1234.567890", held: "6" },
          activity: [
            {
              id: "owned-reference",
              amount: "100",
              type: "P2P",
              status: "COMPLETED",
              createdAt: "2026-11-01T01:00:00Z",
            },
          ],
        }}
      />,
    );
    assert(activity.includes("<table"));
    assert(activity.includes('scope="col"'));
    assert(activity.includes("owned-reference"));
    assert(
      activity.includes('type="search"') ||
        activity.includes("Search") ||
        activity.includes("البحث"),
    );
    assert(!activity.includes("1234.567890"));
    assert(activity.includes("dateTime") || activity.includes("datetime="));
    const unknown = renderToStaticMarkup(
      <FinancialState state="BROADCAST_UNKNOWN" ar={ar} />,
    );
    assert(unknown.includes("pro-state-warning"));
    assert(!unknown.includes("pro-state-success"));
    const empty = renderToStaticMarkup(
      <FinancialEmpty locked title={ar ? "غير مفعّل" : "Not activated"} />,
    );
    assert(empty.includes("pro-empty"));
    const nav = renderToStaticMarkup(
      <AccountNavigation active="/payments" ar={ar} />,
    );
    assert(nav.includes("pro-mobile-nav"));
    assert(nav.includes('aria-current="page"'));
    assert(nav.includes('href="/payments"'));
  }
  const css = await readFile("app/professional.css", "utf8");
  for (const rule of [
    "safe-area-inset-bottom",
    "prefers-reduced-motion",
    "focus-visible",
    ".pro-table-scroll",
    "@media(max-width:680px)",
    "Noto Sans Arabic Variable",
  ])
    assert(css.replace(/\s/g, "").includes(rule.replace(/\s/g, "")));
  const layout = await readFile("app/layout.tsx", "utf8");
  assert(
    layout.indexOf("'./professional.css'") >
      layout.indexOf("'./world-class.css'"),
  );
  console.log(
    "Professional interface PASS: bilingual product illustration without fake financial claims, real ledger table, privacy, UTC dates, status tones, mobile navigation, focus and reduced-motion contracts. Visual/device acceptance remains separate.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
