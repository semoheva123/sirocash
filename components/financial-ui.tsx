"use client";
import { useEffect,useState } from "react";
import { Check, Copy, Inbox, ShieldCheck } from "lucide-react";
const states: Record<string, [string, string, string]> = {
  COMPLETED: ["مكتملة", "Completed", "success"],
  SETTLED: ["تمت التسوية", "Settled", "success"],
  CREDITED: ["أُضيفت إلى الرصيد", "Credited", "success"],
  CONFIRMED: ["مؤكدة على الشبكة", "Confirmed on chain", "success"],
  FAILED: ["لم تكتمل", "Failed", "danger"],
  REJECTED: ["مرفوضة", "Rejected", "danger"],
  BROADCAST_UNKNOWN: [
    "نتيجة الإرسال غير مؤكدة",
    "Broadcast outcome unknown",
    "warning",
  ],
  RESERVED: ["قيد المعالجة", "Processing", "warning"],
  AWAITING_VALUATION: [
    "قيد المعالجة",
    "Processing",
    "warning",
  ],
  SIGNED: [
    "موقّعة؛ بانتظار التأكيد",
    "Signed; awaiting confirmation",
    "neutral",
  ],
  SUBMITTED: ["بانتظار التسوية", "Awaiting settlement", "neutral"],
  PENDING: ["قيد المعالجة", "Processing", "neutral"],
};
export function FinancialState({ state, ar }: { state: string; ar: boolean }) {
  const item = states[state] ?? ["قيد المراجعة", "Under review", "neutral"];
  return (
    <span className={"pro-state pro-state-" + item[2]}>
      <i aria-hidden="true" />
      {item[ar ? 0 : 1]}
    </span>
  );
}
export function FinancialEmpty({
  title,
  description,
  locked = false,
}: {
  title: string;
  description?: string;
  locked?: boolean;
}) {
  const Icon = locked ? ShieldCheck : Inbox;
  return (
    <div className="pro-empty">
      <span>
        <Icon size={25} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  );
}
export function FinancialReference({
  value,
  ar,
  compact = false,
  label,
}: {
  value: string;
  ar: boolean;
  compact?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(()=>{setCopied(false);setFailed(false)},[value]);
  return (
    <span className="pro-reference">
      <code dir="ltr" title={value}>
        {compact && value.length > 24 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value}
      </code>
      <button
        type="button"
        className="pro-icon-button"
        aria-label={label ? (ar ? "نسخ " : "Copy ")+label : ar ? "نسخ المرجع" : "Copy reference"}
        onClick={async () => {
          setCopied(false);setFailed(false);
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      <span className="pro-copy-feedback" role="status">
        {failed
          ? ar
            ? "تعذّر النسخ؛ حدّد المرجع يدويًا."
            : "Copy unavailable; select the reference manually."
          : copied
            ? ar
              ? "تم النسخ"
              : "Copied"
            : ""}
      </span>
    </span>
  );
}
export const financialKind = (type: string, ar: boolean) =>
  ({
    P2P: ["تحويل داخلي", "Internal transfer"],
    TRANSFER: ["تحويل داخلي", "Internal transfer"],
    DEPOSIT: ["إيداع", "Deposit"],
    WITHDRAWAL: ["سحب", "Withdrawal"],
    SHAM_CASH: ["شام كاش", "Sham Cash"],
    MOBILE_TOPUP: ["شحن رصيد الهاتف", "Mobile top-up"],
  })[type]?.[ar ? 0 : 1] ?? (ar ? "حركة مالية" : "Financial movement");
export function FinancialDate({ value, ar }: { value: string; ar: boolean }) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? (
    <span>—</span>
  ) : (
    <time dateTime={d.toISOString()}>
      {d.toLocaleString(ar ? "ar" : "en-GB", {
        timeZone: "UTC",
        year: "numeric",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}{" "}
      UTC
    </time>
  );
}
