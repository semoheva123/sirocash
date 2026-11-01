"use client";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  ShieldCheck,
  LockKeyhole,
  LayoutDashboard,
  Wallet,
  Settings2,
  EyeOff,
  Mail,
  Check,
  Radio,
} from "lucide-react";
/** A labelled product illustration. No invented transactions, payment cards or balances. */
export function PlatformPreview({ ar }: { ar: boolean }) {
  const [security, setSecurity] = useState(false);
  const t = (a: string, e: string) => (ar ? a : e);
  return (
    <div className="pro-product-scene">
      <div
        className="pro-product-window"
        dir={ar ? "rtl" : "ltr"}
        aria-label={t(
          "معاينة توضيحية للواجهة؛ ليست بيانات حساب",
          "Illustrative interface preview; not account data",
        )}
      >
        <div className="pro-window-top">
          <span className="pro-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <LockKeyhole size={12} /> SIROCASH / WORKSPACE
          </span>
          <ShieldCheck size={15} />
        </div>
        <div className="pro-window-body">
          <aside className="pro-preview-rail" aria-hidden="true">
            <span className="pro-preview-brand">
              <ArrowLeftRight size={18} />
            </span>
            <LayoutDashboard size={18} />
            <Wallet size={18} />
            <ArrowLeftRight size={18} />
            <Settings2 size={18} />
          </aside>
          <div className="pro-preview-content">
            <div className="pro-preview-title">
              <div>
                <small>SIROCASH PERSONAL</small>
                <h3>
                  {t(
                    "مساحة مالية أكثر وضوحًا",
                    "A clearer financial workspace",
                  )}
                </h3>
              </div>
              <span className="pro-preview-avatar">S</span>
            </div>
            <div
              className="pro-preview-tabs"
              role="group"
              aria-label={t(
                "استكشاف تصميم الواجهة",
                "Explore interface design",
              )}
            >
              <button
                aria-pressed={!security}
                onClick={() => setSecurity(false)}
              >
                {t("المحفظة", "Wallet")}
              </button>
              <button aria-pressed={security} onClick={() => setSecurity(true)}>
                {t("أمان الحساب", "Account security")}
              </button>
            </div>
            {security ? (
              <div className="pro-preview-security">
                <ShieldCheck size={32} />
                <h4>{t("أمان تديره بنفسك", "Security in your control")}</h4>
                {[
                  { icon: Mail, a: "تأكيد عبر البريد", e: "Email approval" },
                  {
                    icon: LockKeyhole,
                    a: "إدارة جلسات الدخول",
                    e: "Session management",
                  },
                  {
                    icon: ShieldCheck,
                    a: "سجل النشاط الأمني",
                    e: "Security activity",
                  },
                ].map((x) => (
                  <div key={x.e}>
                    <x.icon size={16} />
                    <span>{t(x.a, x.e)}</span>
                    <Check size={15} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="pro-preview-wallet">
                  <div>
                    <span>
                      {t("معاينة الرصيد المخفي", "Hidden balance preview")}
                    </span>
                    <EyeOff size={16} />
                  </div>
                  <strong dir="ltr">
                    •••••• <small>USD</small>
                  </strong>
                  <div className="pro-preview-actions">
                    <span>
                      <ArrowUpRight size={16} />
                      {t("إرسال", "Send")}
                    </span>
                    <span>
                      <ArrowDownLeft size={16} />
                      {t("استلام", "Receive")}
                    </span>
                    <span>
                      <ArrowLeftRight size={16} />
                      {t("العمليات", "Activity")}
                    </span>
                  </div>
                </div>
                <div className="pro-preview-ledger">
                  <div>
                    <Radio size={16} />
                    <strong>
                      {t(
                        "سجل واحد. تفاصيل واضحة.",
                        "One record. Clear details.",
                      )}
                    </strong>
                  </div>
                  <p>
                    {t(
                      "الحالة والمرجع والقيمة، في مكان واحد.",
                      "Status, reference and amount, in one place.",
                    )}
                  </p>
                  <span className="pro-preview-empty">
                    {t(
                      "معاينة تصميم · دون بيانات مالية فعلية",
                      "Design preview · No real financial data",
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="pro-product-note">
        <ShieldCheck size={20} />
        <div>
          <strong>
            {t("التفاصيل أولًا. القرار لك.", "Details first. You decide.")}
          </strong>
          <span>
            {t(
              "مراجعة واضحة قبل تفويض العملية",
              "Clear review before authorizing a payment",
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
