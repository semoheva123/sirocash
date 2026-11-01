"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowLeftRight,
  Smartphone,
  ShieldCheck,
  LockKeyhole,
  Layers,
} from "lucide-react";
import { AccountEssentials } from "./account-essentials";
export function VaultOverview({
  ar,
  balance,
  hidden,
  toggle,
  actions,
  verified,
  loading,
  error,
}: {
  ar: boolean;
  balance: string;
  hidden: boolean;
  toggle: () => void;
  actions: ReactNode;
  verified: boolean;
  loading: boolean;
  error: boolean;
}) {
  const t = (en: string, a: string) => (ar ? a : en);
  return (
    <div className="vault-overview">
      <section className="vault-capital">
        <div className="vault-capital-top">
          <span className="sc-overline">SIROCASH / PERSONAL ACCOUNT</span>
          <span className="vault-currency">
            USD <span>↗</span>
          </span>
        </div>
        <div className="vault-capital-label">
          {t("Your account balance", "رصيد حسابك")}
          <button
            type="button"
            className="balance-privacy"
            onClick={toggle}
            aria-pressed={hidden}
            aria-label={t(
              "Toggle balance visibility",
              "إظهار الرصيد أو إخفاؤه",
            )}
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="vault-capital-number" dir="ltr">
          <span>{hidden ? "••••••" : balance}</span>
          <small>USD</small>
        </div>
        <p>
          {t(
            "Your recorded balance. Nothing assumed.",
            "رصيدك المسجّل. دون بيانات افتراضية.",
          )}
        </p>
        {actions}
        <div className="vault-capital-foot">
          <LockKeyhole size={14} />
          {t("Financial services not activated", "الخدمات المالية غير مفعّلة")}
          <Link href="/payments">
            {t("Financial records", "السجلّ المالي")}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>
      <aside className="vault-assets">
        <span className="sc-overline">
          {t("YOUR NEXT MOVE", "خطوتك التالية")}
        </span>
        <h2>{t("A world of possibilities.", "خياراتك. في مكان واحد.")}</h2>
        <p>
          {t(
            "Preview choices · Not account holdings",
            "خيارات تجريبية · لا تمثّل حيازات حسابك",
          )}
        </p>
        {[
          {
            name: "USDT",
            full: "Tether",
            sign: "₮",
            network: "TRON · BNB Smart Chain",
          },
          {
            name: "USDC",
            full: "USD Coin",
            sign: "$",
            network: "Ethereum · Polygon PoS",
          },
        ].map((a) => (
          <Link href={"/deposit?asset=" + a.name} key={a.name}>
            <span className="vault-token">{a.sign}</span>
            <div>
              <strong>
                {a.name}
                <small>{a.full}</small>
              </strong>
              <span>{a.network}</span>
            </div>
            <ArrowUpRight size={19} />
          </Link>
        ))}
        <Link className="vault-assets-more" href="/deposit">
          <Layers size={16} />
          {t("Explore networks", "استكشاف الشبكات")}
          <ArrowUpRight size={15} />
        </Link>
      </aside>
      <section
        className="vault-services workspace-services"
        aria-label={t("Account shortcuts", "الوصول السريع للخدمات")}
      >
        <div>
          <span className="sc-overline">
            {t("BEYOND YOUR WALLET", "أكثر من محفظة")}
          </span>
          <h2>{t("Made for your everyday.", "أقرب إلى يومك.")}</h2>
        </div>
        {[
          {
            href: "/sham-cash",
            icon: ArrowLeftRight,
            title: t("Sham Cash", "شام كاش"),
            sub: t("Transfer service", "خدمة التحويلات"),
          },
          {
            href: "/mobile-topup",
            icon: Smartphone,
            title: t("Mobile top-up", "شحن رصيد الهاتف"),
            sub: "Syriatel / MTN",
          },
        ].map((s) => (
          <Link href={s.href} key={s.href}>
            <s.icon size={24} />
            <div>
              <strong>{s.title}</strong>
              <small>{s.sub}</small>
            </div>
            <span>{t("Not activated", "غير مفعّلة")}</span>
            <ArrowUpRight size={19} />
          </Link>
        ))}
      </section>
      <AccountEssentials
        ar={ar}
        verified={verified}
        loading={loading}
        error={error}
      />
      <div className="vault-account-note">
        <ShieldCheck size={17} />
        {t(
          "A considered workspace. A clear account record.",
          "مساحة مدروسة. وسجلّ واضح لحسابك.",
        )}
        <Link href="/settings">
          {t("Manage your account", "إدارة الحساب")}
          <ArrowUpRight size={15} />
        </Link>
      </div>
    </div>
  );
}
