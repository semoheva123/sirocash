"use client";
import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {displayAvailableBalance} from "@/lib/account-overview";
import type { FinancialStatus } from "./use-financial-status";
import {
  FinancialDate,
  FinancialEmpty,
  FinancialReference,
  FinancialState,
  financialKind,
} from "./financial-ui";
export function FinancialActivity({
  status,
  ar,
  hideBalance = false,
  showBalance = true,
}: {
  status: FinancialStatus;
  ar: boolean;
  hideBalance?: boolean;
  showBalance?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL");
  const t = (a: string, e: string) => (ar ? a : e);
  const rows = useMemo(
    () =>
      status.activity?.filter(
        (a) =>
          (filter === "ALL" || a.type === filter) &&
          (a.id.toLowerCase().includes(search.toLowerCase().trim()) ||
            financialKind(a.type, ar)
              .toLowerCase()
              .includes(search.toLowerCase().trim())),
      ) ?? [],
    [status.activity, filter, search, ar],
  );
  return (
    <section
      className="card pro-ledger"
      aria-label={t("الحركات المالية المثبتة", "Posted financial activity")}
    >
      <div className="pro-section-heading">
        <div>
          <span className="pro-eyebrow">
            {t("سجل الحساب", "ACCOUNT ACTIVITY")}
          </span>
          <h2>{t("الحركات المالية المثبتة", "Posted financial activity")}</h2>
        </div>
        <span className="pro-count">
          {status.activity?.length ?? 0} {t("حركة معروضة", "displayed entries")}
        </span>
      </div>
      {showBalance&&<div className="pro-balance-summary"><div><span>{t('إجمالي الرصيد · USD','Total balance · USD')}</span><strong dir="ltr">{hideBalance?'••••••':displayAvailableBalance(status,status.userId)}</strong></div></div>}
      <div className="pro-table-tools">
        <label className="pro-search">
          <Search size={17} />
          <span className="pro-sr-only">
            {t("البحث في الحركات المعروضة", "Search displayed activity")}
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              "ابحث بالمرجع أو نوع الحركة…",
              "Search reference or movement type…",
            )}
          />
        </label>
        <label className="pro-filter">
          <SlidersHorizontal size={16} />
          <span className="pro-sr-only">
            {t("نوع الحركة", "Movement type")}
          </span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">{t("كل الحركات", "All movements")}</option>
            {["P2P", "DEPOSIT", "WITHDRAWAL", "SHAM_CASH", "MOBILE_TOPUP"].map(
              (k) => (
                <option key={k} value={k}>
                  {financialKind(k, ar)}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <p className="pro-mobile-unit">
        {t(
          "جميع القيم بالدولار الأمريكي · USD",
          "All amounts in US dollars · USD",
        )}
      </p>
      {rows.length ? (
        <div
          className="pro-table-scroll"
          role="region"
          aria-label={t(
            "سجل الحركات؛ قابل للتمرير أفقيًا",
            "Activity table; scroll horizontally",
          )}
          tabIndex={0}
        >
          <table className="pro-financial-table" role="table">
            <thead role="rowgroup">
              <tr role="row">
                {[
                  t("الحركة والمرجع", "Movement & reference"),
                  t("التاريخ", "Date"),
                  t("الحالة", "Status"),
                  t("القيمة · USD", "Amount · USD"),
                ].map((h) => (
                  <th role="columnheader" scope="col" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {rows.map((a) => {
                const incoming = !a.amount.startsWith("-"),
                  Icon = incoming ? ArrowDownLeft : ArrowUpRight;
                return (
                  <tr role="row" key={a.id}>
                    <td role="cell">
                      <div className="pro-movement">
                        <span
                          className={
                            "pro-movement-icon " +
                            (incoming ? "incoming" : "outgoing")
                          }
                        >
                          <Icon size={18} />
                        </span>
                        <div>
                          <strong>{financialKind(a.type, ar)}</strong>
                          <FinancialReference value={a.id} ar={ar} />
                        </div>
                      </div>
                    </td>
                    <td role="cell">
                      <FinancialDate value={a.createdAt} ar={ar} />
                    </td>
                    <td role="cell">
                      <FinancialState state={a.status} ar={ar} />
                    </td>
                    <td
                      role="cell"
                      className={"pro-money " + (incoming ? "incoming" : "")}
                      dir="ltr"
                    >
                      {hideBalance
                        ? "••••••"
                        : (incoming ? "+" : "") + a.amount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <FinancialEmpty
          title={t("لا توجد حركات مطابقة", "No matching activity")}
          description={t(
            "ستظهر حركات حسابك هنا بعد تسجيلها. البحث يقتصر على أحدث الحركات المعروضة.",
            "Your movements appear after posting. Search covers the latest displayed records only.",
          )}
        />
      )}
    </section>
  );
}
