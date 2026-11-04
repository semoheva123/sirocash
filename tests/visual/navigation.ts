/** Test-only navigation adapter. Does not submit or replay any request. */
export function useRouter(){return {refresh:()=>window.dispatchEvent(new Event('visual-recovery-refresh'))}}
