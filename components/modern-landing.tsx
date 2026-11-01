import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDown,
  ShieldCheck,
  Globe2,
  Fingerprint,
  ArrowLeftRight,
  Smartphone,
  Mail,
  MoveUpRight,
} from "lucide-react";
import { PlatformGuide } from "./platform-guide";
import { ServiceShowcase } from "./service-showcase";
export function ModernLanding({ ar }: { ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  return (
    <main id="main-content" tabIndex={-1} className="sc-landing">
      <section className="sc-hero sc-frame">
        <div className="sc-hero-copy">
          <span className="sc-overline">
            <i /> SIROCASH — PERSONAL EDITION
          </span>
          <h1>
            {t("Your money.", "أموالك.")}
            <br />
            <em>{t("A wider horizon.", "برؤية أوسع.")}</em>
          </h1>
          <p>
            {t(
              "Not another dashboard. A considered financial space, built around you. Your wallet, your decisions, your next move.",
              "ليست مجرّد محفظة. مساحة مالية صُمّمت حولك؛ تجمع حسابك وخدماتك وقراراتك، في تجربة تستحقّها.",
            )}
          </p>
          <div className="sc-hero-links">
            <Link className="sc-button" href="/auth">
              {t("Enter your new space", "ابدأ تجربتك الجديدة")}
              <span>
                <ArrowUpRight size={20} />
              </span>
            </Link>
            <a className="sc-text-link" href="#business">
              {t("Discover SiroCash", "اكتشف سيرو كاش")}
              <ArrowDown size={16} />
            </a>
          </div>
          <div className="sc-release">
            <span />
            {t(
              "Product preview. Live financial services are not activated.",
              "إصدار تجريبي. الخدمات المالية الفعلية غير مفعّلة.",
            )}
          </div>
        </div>
        <div className="sc-hero-art">
          <Image
            src="/images/siro-sculpture.webp"
            alt=""
            width={1024}
            height={1024}
            priority
          />
          <div className="sc-art-caption">
            <span>01 / A NEW PERSPECTIVE</span>
            <span>SIROCASH</span>
          </div>
          <div className="sc-art-seal">
            <ArrowLeftRight size={24} />
            <span>{t("Different by design", "اختلافٌ يبدأ من التصميم")}</span>
          </div>
        </div>
      </section>
      <section
        className="sc-manifesto sc-frame"
        aria-label={t("Platform principles", "مبادئ المنصة")}
      >
        <span>
          {t("LESS NOISE. MORE INTENTION.", "تفاصيل أقل. معنى أكبر.")}
        </span>
        <p>
          {t(
            "One account. Every detail in its place.",
            "حساب واحد. وكلّ تفصيلة في مكانها.",
          )}
          <small>
            {t(
              "Native Arabic & English. Clear review. Account-level controls.",
              "عربية وإنجليزية أصيلة. مراجعة واضحة. وتحكّم على مستوى الحساب.",
            )}
          </small>
        </p>
        <a
          href="#business"
          aria-label={t("Explore services", "استكشاف الخدمات")}
        >
          <ArrowDown size={23} />
        </a>
      </section>
      <section className="sc-experience sc-frame" id="business">
        <div className="sc-section-title">
          <span className="sc-overline">
            01 / {t("THE EXPERIENCE", "التجربة")}
          </span>
          <h2>
            {t("Every move.", "لكلّ خطوة.")}
            <br />
            <em>{t("A better starting point.", "بداية أفضل.")}</em>
          </h2>
          <p>
            {t(
              "A single destination for your financial day. Explore the experience, with availability always made clear.",
              "وجهة واحدة لتفاصيل يومك المالي. استكشف الخدمات، مع بيان واضح لحالة إتاحتها.",
            )}
          </p>
        </div>
        <ServiceShowcase ar={ar} />
        <div className="sc-asset-line">
          <span>USDT / USDC</span>
          <Link href="/deposit">
            {t("Explore asset networks", "استكشاف العملات والشبكات")}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="sc-service-links">
          {[
            {
              href: "/sham-cash",
              icon: ArrowLeftRight,
              title: t("Sham Cash", "شام كاش"),
              description: t(
                "1–24 hours during designated operating days. Not activated.",
                "من ساعة إلى 24 ساعة خلال أيام التنفيذ المحدّدة. غير مفعّلة.",
              ),
            },
            {
              href: "/mobile-topup",
              icon: Smartphone,
              title: t("Stay connected", "ابقَ على اتصال"),
              description: t(
                "Syriatel & MTN screens. No real recharge.",
                "واجهات سيريتل وMTN. دون شحن رصيد فعلي.",
              ),
            },
          ].map((s, i) => (
            <Link href={s.href} key={s.href}>
              <span className="sc-service-number">0{i + 1}</span>
              <s.icon size={25} />
              <div>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
              </div>
              <MoveUpRight size={23} />
            </Link>
          ))}
        </div>
      </section>
      <section className="sc-security" id="security">
        <div className="sc-frame sc-security-inner">
          <div>
            <span className="sc-overline">
              02 / {t("BUILT ON CONTROL", "التحكّم أساس التجربة")}
            </span>
            <h2>
              {t("Confidence isn’t", "الثقة لا تأتي")}
              <br />
              <em>{t("an afterthought.", "في آخر القائمة.")}</em>
            </h2>
            <Link href="/trust" className="sc-text-link">
              {t("Security & platform status", "الحماية وحالة المنصة")}
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="sc-security-list">
            {[
              {
                icon: Mail,
                title: t("Email-approved changes", "تغييرات بتأكيدك"),
                text: t(
                  "Sensitive account changes require email approval.",
                  "تأكيد التغييرات الحسّاسة عبر بريدك الإلكتروني.",
                ),
              },
              {
                icon: Fingerprint,
                title: t("Your device. Your approval.", "جهازك. موافقتك."),
                text: t(
                  "Device verification is required for financial authorization.",
                  "يلزم التحقق من الجهاز لتفويض العمليات المالية.",
                ),
              },
              {
                icon: ShieldCheck,
                title: t("A clear account record", "سجلّ واضح لحسابك"),
                text: t(
                  "Manage sessions and review security activity.",
                  "أدر جلسات الدخول وراجع النشاط الأمني.",
                ),
              },
            ].map((s) => (
              <div key={s.title}>
                <s.icon size={25} />
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="sc-onboarding sc-frame" id="how-it-works">
        <div className="sc-section-title">
          <span className="sc-overline">
            03 / {t("YOUR FIRST STEP", "خطوتك الأولى")}
          </span>
          <h2>
            {t("A fresh beginning.", "بداية مختلفة.")}
            <br />
            <em>{t("Entirely yours.", "تخصّك بالكامل.")}</em>
          </h2>
        </div>
        <div className="sc-steps">
          {[
            {
              title: t("Create your account", "أنشئ حسابك"),
              text: t(
                "Your email. A unique password.",
                "بريدك الإلكتروني. وكلمة مرور فريدة.",
              ),
            },
            {
              title: t("Confirm your email", "أكّد بريدك"),
              text: t(
                "Enter the verification code sent to you.",
                "أدخل رمز التحقق المرسل إليك.",
              ),
            },
            {
              title: t("Make yourself at home", "استكشف مساحتك"),
              text: t(
                "Manage your account. Financial services remain inactive.",
                "أدر حسابك. الخدمات المالية لا تزال غير مفعّلة.",
              ),
            },
          ].map((s, i) => (
            <div key={s.title}>
              <span>0{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="sc-frame sc-guide">
        <PlatformGuide ar={ar} faqOnly />
      </div>
      <section className="sc-invitation sc-frame">
        <span className="sc-overline">THE NEXT CHAPTER IS YOURS.</span>
        <h2>
          {t("Make room", "مساحة جديدة.")}
          <br />
          {t("for something better.", "لتجربة تستحقّها.")}
        </h2>
        <Link className="sc-button" href="/auth">
          {t("Create your account", "أنشئ حسابك")}
          <span>
            <ArrowUpRight size={21} />
          </span>
        </Link>
        <p>
          {t(
            "Preview release · No real financial transactions",
            "نسخة تجريبية · دون معاملات مالية فعلية",
          )}
        </p>
        <Globe2
          className="sc-invitation-globe"
          aria-hidden="true"
          strokeWidth={0.35}
        />
      </section>
    </main>
  );
}
