"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {useFinancialStatus} from "./use-financial-status";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Share2, UserRound } from "lucide-react";
import {
  formatUid,
  normalizeUid,
  type ReceivingIdentity,
} from "@/lib/receiving-uid";
function useReceivingIdentitySource(ownerId: string, enabled=true, initialIdentity:ReceivingIdentity|null=null) {
  const seededOwner=useRef(initialIdentity?ownerId:null);
  const [stored, setStored] = useState<{
      ownerId: string;
      identity: ReceivingIdentity;
    } | null>(initialIdentity ? {ownerId, identity:initialIdentity} : null),
    [error, setError] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled || (version===0 && initialIdentity && seededOwner.current===ownerId)) return;
    const controller = new AbortController();
    let active = true;
    setError(false);
    fetch("/api/account/receiving-identity", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const body = await response.json();
        if (body.userId !== ownerId || !normalizeUid(body.identity?.uid ?? ""))
          throw Error();
        if (active) setStored({ ownerId, identity: body.identity });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [ownerId, version, enabled]);
  return {
    identity: stored?.ownerId === ownerId ? stored.identity : null,
    error,
    reload: () => setVersion((v) => v + 1),
  };
}
const ReceivingContext=createContext<{ownerId:string;value:ReturnType<typeof useReceivingIdentitySource>}|null>(null);
/** Layout-scoped, in-memory only: one request shared by all account views. */
export function ReceivingIdentityProvider({children,ownerId,initialIdentity}:{children:React.ReactNode;ownerId:string;initialIdentity:ReceivingIdentity|null}) {
 const {sync}=useFinancialStatus(true,ownerId);
 const value=useReceivingIdentitySource(ownerId,sync!=='unauthenticated',initialIdentity);
 return <ReceivingContext.Provider value={{ownerId,value:sync==='unauthenticated'?{...value,identity:null}:value}}>{children}</ReceivingContext.Provider>;
}
export function useReceivingIdentity(ownerId:string) {
 const shared=useContext(ReceivingContext);
 const own=useReceivingIdentitySource(ownerId,!shared);
 if(shared)return shared.ownerId===ownerId?shared.value:{identity:null,error:false,reload:()=>{}};
 return own;
}
export function RecipientIdentityCard({
  identity,
  ar,
}: {
  identity: ReceivingIdentity;
  ar: boolean;
}) {
  return (
    <section
      className="recipient-identity-card"
      aria-label={ar ? "بيانات المستفيد" : "Recipient details"}
    >
      <span className="recipient-avatar">
        <UserRound size={23} />
      </span>
      <div>
        <small>{ar ? "المستفيد" : "Recipient"}</small>
        <strong>{identity.displayName}</strong>
        {identity.username && <span dir="ltr">@{identity.username}</span>}
        <span dir="ltr">UID · {formatUid(identity.uid)}</span>
        <p
          className={
            identity.identityVerified
              ? "identity-verified"
              : "identity-unverified"
          }
        >
          {identity.identityVerified
            ? ar
              ? "الهوية موثّقة"
              : "Identity verified"
            : ar
              ? "الهوية غير موثّقة"
              : "Identity not verified"}
        </p>
      </div>
      <p className="recipient-name-note">
        {ar
          ? "اسم العرض يختاره المستخدم، وليس إثباتًا لهويته. تحقّق من UID قبل التأكيد."
          : "Display names are chosen by users, not proof of identity. Verify the UID before confirming."}
      </p>
    </section>
  );
}
export function ReceivingIdentityPanel({
  ownerId,
  ar,
  editable = false,
}: {
  ownerId: string;
  ar: boolean;
  editable?: boolean;
}) {
  const { identity, error, reload } = useReceivingIdentity(ownerId);
  const [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [copied, setCopied] = useState(false),
    [qr, setQr] = useState(false);
  const t = (a: string, e: string) => (ar ? a : e);
  useEffect(() => {
    setName(identity?.displayName ?? "");
    setUsername(identity?.username ?? "");
    setNotice("");
    setCopied(false);
    setQr(false);
  }, [identity]);
  async function copy() {
    if (!identity) return;
    try {
      await navigator.clipboard.writeText(identity.uid);
      setCopied(true);
      setNotice(t("تم نسخ UID كاملًا.", "UID copied."));
    } catch {
      setNotice(
        t(
          "تعذّر النسخ؛ حدّد UID وانسخه يدويًا.",
          "Copy unavailable; select and copy the UID manually.",
        ),
      );
    }
  }
  async function share() {
    if (!identity) return;
    try {
      if (navigator.share)
        await navigator.share({
          title: "Siro Cash UID",
          text: `Siro Cash UID: ${formatUid(identity.uid)}\nsirocash:pay:${identity.uid}`,
        });
      else await copy();
    } catch {
      setNotice(
        t(
          "لم تتم المشاركة. يمكنك نسخ UID.",
          "Not shared. You can copy the UID.",
        ),
      );
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/account/receiving-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name.trim(),
          username: username || null,
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw Error(body.error);
      }
      reload();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : t("تعذّر الحفظ.", "Could not save."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="receiving-identity-panel">
      <h2>{t("معرّف استلامك · UID", "Your receiving ID · UID")}</h2>
      {!identity ? (
        <p role="status">
          {error
            ? t("تعذّر تحميل UID.", "Could not load UID.")
            : t("جارٍ تحميل UID…", "Loading UID…")}
        </p>
      ) : (
        <>
          <strong className="receiving-uid" dir="ltr">
            {formatUid(identity.uid)}
          </strong>
          <p>
            {t(
              "للتحويل داخل Siro Cash فقط، وليس عنوان عملات رقمية.",
              "For transfers within Siro Cash only. Not a cryptocurrency address.",
            )}
          </p>
          {!identity.displayName && (
            <div className="receiving-setup-note">
              <p>
                {t(
                  "أكمل اسم العرض في إعدادات حسابك ليتمكن الآخرون من تأكيد هويتك كمستفيد قبل التحويل.",
                  "Set your display name in account settings so senders can confirm your recipient profile before transferring.",
                )}
              </p>
              {!editable && (
                <Link href="/settings#profile">
                  {t("إكمال بيانات الاستلام", "Complete receiving profile")}
                </Link>
              )}
            </div>
          )}
          <div className="receiving-uid-actions">
            <button type="button" onClick={() => void copy()}>
              {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
              {t("نسخ UID", "Copy UID")}
            </button>
            <button type="button" onClick={() => void share()}>
              <Share2 size={17} /> {t("مشاركة", "Share")}
            </button>
            <button type="button" aria-expanded={qr} onClick={() => setQr(!qr)}>
              QR
            </button>
          </div>
          {qr && (
            <div className="receiving-uid-qr">
              <QRCodeSVG
                value={`sirocash:pay:${identity.uid}`}
                title="Siro Cash UID"
                size={160}
                marginSize={4}
              />
            </div>
          )}
          {editable && (
            <form className="receiving-profile-form" onSubmit={save}>
              <label>
                {t("اسم العرض", "Display name")}
                <input
                  required
                  minLength={2}
                  maxLength={60}
                  autoComplete="nickname"
                  value={name}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                {t(
                  "اسم المستخدم · اختياري وثابت بعد اختياره",
                  "Username · optional, permanent once set",
                )}
                <input
                  dir="ltr"
                  minLength={4}
                  maxLength={24}
                  pattern="[a-z][a-z0-9_]{3,23}"
                  value={username}
                  disabled={busy || !!identity.username}
                  autoCapitalize="none"
                  autoComplete="off"
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
              </label>
              <small>
                {t(
                  "سيظهر اسم العرض للمرسلين، وهو ليس توثيقًا للهوية. اسم المستخدم: حروف إنجليزية صغيرة وأرقام وشرطة سفلية.",
                  "Your display name is visible to senders, not identity verification. Username: lowercase Latin letters, digits and underscores.",
                )}
              </small>
              <button className="button" type="submit" disabled={busy}>
                {busy
                  ? t("جارٍ الحفظ…", "Saving…")
                  : t("حفظ بيانات الاستلام", "Save receiving profile")}
              </button>
            </form>
          )}
        </>
      )}
      {error && (
        <button type="button" className="button secondary" onClick={reload}>
          {t("إعادة المحاولة", "Retry")}
        </button>
      )}
      <p className="receiving-uid-feedback" role="status">
        {notice}
      </p>
    </section>
  );
}
