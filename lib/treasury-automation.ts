/** Pure treasury policy. Never signs, broadcasts, or treats an RPC response as verified evidence. */
export type TreasuryPolicy = {
  lowWater: bigint; target: bigint; maxTopup: bigint; dailyLimit: bigint;
  reserveFloor: bigint; maxFee: bigint; evidenceMaxAgeMs: number;
};
export type TreasurySnapshot = {
  operating: bigint; reserve: bigint; fee: bigint; spentToday: bigint;
  observedAt: number; now: number; reconciled: boolean; pendingRefill: boolean;
};
export type RefillDecision = { action: 'WAIT'; reason: string } | { action: 'PREPARE'; amount: bigint };

/** Amounts are base units of ONE asset/network; never sum USDT, TRX or chains together. */
export function planTreasuryRefill(policy: TreasuryPolicy, snapshot: TreasurySnapshot): RefillDecision {
  const p = policy, s = snapshot;
  for (const v of [p.lowWater,p.target,p.maxTopup,p.dailyLimit,p.reserveFloor,p.maxFee,s.operating,s.reserve,s.fee,s.spentToday]) {
    if (typeof v !== 'bigint' || v < 0n) throw new Error('INVALID_TREASURY_UNITS');
  }
  if (p.target <= p.lowWater || p.maxTopup === 0n || p.dailyLimit === 0n ||
      !Number.isSafeInteger(p.evidenceMaxAgeMs) || p.evidenceMaxAgeMs <= 0) throw new Error('INVALID_TREASURY_POLICY');
  if (!Number.isSafeInteger(s.now) || !Number.isSafeInteger(s.observedAt) || s.observedAt > s.now ||
      s.now - s.observedAt > p.evidenceMaxAgeMs) return { action:'WAIT', reason:'STALE_EVIDENCE' };
  if (!s.reconciled) return { action:'WAIT', reason:'RECONCILIATION_REQUIRED' };
  if (s.pendingRefill) return { action:'WAIT', reason:'PENDING_REFILL_REQUIRES_RECONCILIATION' };
  if (s.operating >= p.lowWater) return { action:'WAIT', reason:'SUFFICIENT_OPERATING_BALANCE' };
  if (s.fee > p.maxFee) return { action:'WAIT', reason:'FEE_CAP' };
  const amount = p.target - s.operating;
  // Never silently split a large refill into repeated requests to bypass per-operation limits.
  if (amount > p.maxTopup) return { action:'WAIT', reason:'TOPUP_CAP' };
  if (s.spentToday + amount > p.dailyLimit) return { action:'WAIT', reason:'DAILY_CAP' };
  if (s.reserve < amount + p.reserveFloor) return { action:'WAIT', reason:'RESERVE_FLOOR' };
  return { action:'PREPARE', amount };
}

/** Deployment readiness only; booleans must come from audited checks, not customer input. */
export function custodyReadiness(checks: Record<string, boolean>): { ready: boolean; blockers: string[] } {
  const required = ['isolatedSigner','independentWalletKeys','fixedDestinationAllowlist','durableDispatch',
    'persistentDeviceApproval','verifiedDepositWatcher','chainFinalityChecks','databaseRoleTests',
    'realPostgresConcurrencyTests','reconciliation','providerPriceCap','fundedIntegrationTests'];
  const blockers = required.filter(key => checks[key] !== true);
  return { ready: blockers.length === 0, blockers };
}
