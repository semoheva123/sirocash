export function AccountLoading({ar=true}:{ar?:boolean}){
 return <main className="account-loading" aria-busy="true" aria-label={ar?'جارٍ تحميل الحساب':'Loading account'}><section><p role="status">{ar?'جارٍ تحميل الحساب…':'Loading your account…'}</p><div className="account-loading-line" aria-hidden="true"/><div className="account-loading-line" aria-hidden="true"/></section></main>;
}
