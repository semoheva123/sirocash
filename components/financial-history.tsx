"use client";
import { ArrowDownLeft, ArrowUpRight, MapPin, Layers } from "lucide-react";
import { FinancialActivity } from "./financial-activity";
import {
  FinancialEmpty,
  FinancialState,
  FinancialReference,
  FinancialDate,
  financialKind,
} from "./financial-ui";
import type { FinancialStatus } from "./use-financial-status";
export function FinancialHistory({
  status,
  ar,
  hideBalance = false,
}: {
  status: FinancialStatus;
  ar: boolean;
  hideBalance?: boolean;
}) {
  const t = (a: string, e: string) => (ar ? a : e);
  return (
    <div className="financial-history" data-financial-source="shared-sse">
      <FinancialActivity status={status} ar={ar} hideBalance={hideBalance} />
      <div className="pro-history-grid">
        <section className="card">
          <div className="pro-section-heading">
            <div className="pro-icon-title">
              <Layers size={19} />
              <h2>
                {t(
                  "طلبات الحساب وحالات تنفيذها",
                  "Account commands and execution states",
                )}
              </h2>
            </div>
          </div>
          {status.operations?.length ? (
            <ul className="pro-records">
              {status.operations.map((o) => (
                <li key={o.id}>
                  <div className="pro-record-heading">
                    <strong>{financialKind(o.kind, ar)}</strong>
                    <span dir="ltr" className="pro-money">
                      {hideBalance ? "••••••" : o.amount + " USD"}
                    </span>
                  </div>
                  <FinancialReference value={o.id} ar={ar} />
                  <div className="pro-record-footer">
                    <FinancialState state={o.state} ar={ar} />
                    <FinancialDate value={o.createdAt} ar={ar} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <FinancialEmpty
              title={t("لا توجد طلبات مسجّلة.", "No recorded commands.")}
            />
          )}
        </section>
        <section className="card">
          <div className="pro-section-heading">
            <div className="pro-icon-title">
              <MapPin size={19} />
              <h2>
                {t(
                  "عناوين الإيداع المخصّصة لحسابك",
                  "Your assigned deposit addresses",
                )}
              </h2>
            </div>
          </div>
          {status.addresses?.length ? (
            <ul className="pro-records">
              {status.addresses.map((a) => (
                <li key={a.network}>
                  <div className="pro-record-heading">
                    <strong>{a.network}</strong>
                    <span className="pro-network-label">
                      {t("عنوان الحساب", "Account address")}
                    </span>
                  </div>
                  <FinancialReference value={a.address} ar={ar} />
                </li>
              ))}
            </ul>
          ) : (
            <FinancialEmpty
              title={t(
                "لا توجد عناوين مخصّصة للعرض.",
                "No assigned addresses to display.",
              )}
            />
          )}
        </section>
      </div>
      <div className="pro-history-grid">
        <section className="card">
          <div className="pro-section-heading">
            <div className="pro-icon-title">
              <ArrowDownLeft size={19} />
              <h2>
                {t(
                  "الإيداعات التي رصدها النظام",
                  "Deposits observed by the system",
                )}
              </h2>
            </div>
          </div>
          <p className="pro-card-caption">
            {t(
              "رصد الإيداع لا يعني إضافته إلى رصيدك. تُعرض الإضافة في دفتر الحسابات بعد التحقق والتقييم.",
              "Observation is not ledger credit. Credit appears after verification and valuation.",
            )}
          </p>
          {status.deposits?.length ? (
            <ul className="pro-records">
              {status.deposits.map((d) => (
                <li key={d.id}>
                  <div className="pro-record-heading">
                    <strong>{d.network}</strong>
                    <FinancialState state={d.state} ar={ar} />
                  </div>
                  <FinancialReference value={d.txId} ar={ar} />
                  <FinancialDate value={d.createdAt} ar={ar} />
                </li>
              ))}
            </ul>
          ) : (
            <FinancialEmpty
              title={t(
                "لا توجد إيداعات مرصودة للعرض.",
                "No observed deposits to display.",
              )}
            />
          )}
        </section>
        <section className="card">
          <div className="pro-section-heading">
            <div className="pro-icon-title">
              <ArrowUpRight size={19} />
              <h2>
                {t(
                  "حالة إرسال السحوبات إلى الشبكة",
                  "Withdrawal network delivery",
                )}
              </h2>
            </div>
          </div>
          <p className="pro-card-caption">
            {t(
              "حجز المبلغ أو توقيع المعاملة ليس تأكيدًا على الشبكة.",
              "Reservation or signing is not network confirmation.",
            )}
          </p>
          {status.payouts?.length ? (
            <ul className="pro-records">
              {status.payouts.map((p) => (
                <li key={p.id}>
                  <div className="pro-record-heading">
                    <strong>{p.network}</strong>
                    <FinancialState state={p.state} ar={ar} />
                  </div>
                  <FinancialReference value={p.txId} ar={ar} />
                  <FinancialDate value={p.createdAt} ar={ar} />
                </li>
              ))}
            </ul>
          ) : (
            <FinancialEmpty
              title={t(
                "لا توجد معاملات سحب على الشبكة للعرض.",
                "No network withdrawals to display.",
              )}
            />
          )}
        </section>
      </div>
    </div>
  );
}
