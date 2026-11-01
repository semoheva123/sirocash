"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Wallet,
  Layers,
  ShieldCheck,
  Check,
  LockKeyhole,
} from "lucide-react";
export function ServiceShowcase({ ar }: { ar: boolean }) {
  const [selected, setSelected] = useState(0);
  const t = (en: string, a: string) => (ar ? a : en);
  const items = [
    {
      icon: Wallet,
      label: t("Your financial overview", "صورة مالية متكاملة"),
      title: t("Clarity is a powerful thing.", "الوضوح. قوّة بين يديك."),
      text: t(
        "Ledger-backed balances, readable records and balance privacy in one workspace. No illustrative activity is mixed with your account.",
        "أرصدة دفترية وسجلّ مقروء وتحكّم في خصوصية رصيدك، في مساحة واحدة. لا تختلط البيانات التوضيحية بحسابك.",
      ),
      href: "/dashboard",
      action: t("Explore the workspace", "استكشف مساحة الحساب"),
    },
    {
      icon: Layers,
      label: t("Digital assets, considered", "عملاتك الرقمية، بوضوح"),
      title: t(
        "The right asset. The right network.",
        "العملة الصحيحة. الشبكة الصحيحة.",
      ),
      text: t(
        "Explore USDT on TRON and BNB Smart Chain; native USDC on Ethereum and Polygon PoS. Availability is shown before you proceed.",
        "استكشف USDT على TRON وBNB Smart Chain، وUSDC الأصلية على Ethereum وPolygon PoS، مع توضيح حالة الإتاحة قبل المتابعة.",
      ),
      href: "/deposit",
      action: t("Explore asset networks", "استكشف العملات والشبكات"),
    },
    {
      icon: ShieldCheck,
      label: t("Control that stays yours", "تحكّم يبقى لك"),
      title: t(
        "Personal, down to the details.",
        "تجربة تخصّك. حتى آخر تفصيلة.",
      ),
      text: t(
        "Review account security, email approval and session controls. Real financial services remain inactive.",
        "راجع حماية الحساب وتأكيد البريد وإدارة الجلسات. الخدمات المالية الفعلية غير مفعّلة.",
      ),
      href: "/trust",
      action: t("Review platform controls", "راجع ضوابط المنصة"),
    },
  ];
  const item = items[selected];
  return (
    <div className="sc-showcase">
      <div
        className="sc-showcase-menu"
        role="group"
        aria-label={t("Explore the experience", "استكشاف التجربة")}
      >
        {items.map((s, i) => (
          <button
            key={s.href}
            type="button"
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
          >
            <span>0{i + 1}</span>
            <s.icon size={20} />
            <strong>{s.label}</strong>
            <ArrowUpRight size={18} />
          </button>
        ))}
        <p>
          <LockKeyhole size={13} />
          {t(
            "Preview only · Services not activated",
            "معاينة فقط · الخدمات غير مفعّلة",
          )}
        </p>
      </div>
      <div className="sc-showcase-content">
        <span className="sc-showcase-glyph" aria-hidden="true">
          <item.icon size={48} strokeWidth={1} />
        </span>
        <span className="sc-overline">
          SIROCASH / {String(selected + 1).padStart(2, "0")}
        </span>
        <h3>{item.title}</h3>
        <p>{item.text}</p>
        <Link href={item.href}>
          {item.action}
          <ArrowUpRight size={20} />
        </Link>
        <div className="sc-showcase-foot">
          <Check size={14} />
          {t("Details before decisions", "التفاصيل قبل القرار")}
          <span>USDT / USDC</span>
        </div>
      </div>
    </div>
  );
}
