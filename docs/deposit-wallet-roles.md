# Owner-declared wallet roles

The owner reassigned the **entire former reserve wallet** to customer deposits on both networks, and created a separate new reserve wallet. Do not ask for this role decision again or restore the obsolete reserve mapping.

| Network | Owner-reported first deposit address | First address path |
|---|---|---|
| TRC20 | `THici1qxA1dQZK52fJ18RHX8j1Ef1ktyDD` | `m/44'/195'/0'/0/0` |
| BEP20 / BSC 56 | `0x6CD3350E7E635079038b6348781934e4040aC99b` | `m/44'/60'/0'/0/0` |

Both accounts are intended to derive from the same deposit wallet seed, with different hardened coin accounts. This declaration and the reported public addresses are not cryptographic verification of the seed, account ancestry, XPUB/XPRV correspondence, or production custody configuration. Never derive the BEP20 hardened account from the TRON account key.

The new reserve addresses have not been configured. Both reserve destinations are null and their accessors fail closed. Reserve automation and automatic operating refill remain disabled. Existing operating addresses are unchanged.

These first-address references must not be assigned as shared customer deposit addresses or treated as a live vault. Provisioning still requires safe account key verification and durable per-customer address allocation. No secret import, deployment, signing activation or database provisioning was performed for this role correction.
