'use client';
export default function ErrorPage({reset}:{reset:()=>void}){
 return <main dir="rtl" className="route-account-error"><h1>تعذّر تحميل الصفحة بأمان</h1><p>تعذّر التحقق من جلسة الحساب حالياً. يُرجى إعادة المحاولة. لم يتم تحويلك إلى محفظة تجريبية.</p><p lang="en" dir="ltr">Your account session could not be verified. Please try again.</p><button className="button" onClick={reset}>إعادة المحاولة / Retry</button></main>;
}
