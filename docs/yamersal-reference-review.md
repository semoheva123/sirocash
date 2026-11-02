# Reference-led wallet hierarchy review

## Sources reviewed

- Official listing: https://play.google.com/store/apps/details?id=com.yawallet
- Public screenshots indexed at https://yawallet.andro.io/ and
  https://www.appbrain.com/app/com.yawallet
- Official external-remittance guide:
  https://academy.yamersal.com/send-a-transfer-to-syria/

Five publicly indexed screenshot files were downloaded to ignored `.cache/yamersal/`
and visually inspected. They include a wallet overview, transaction history,
internal-send form and referral screen. Some are small/older marketing screenshots;
this does not establish full coverage of current authenticated screens. Reference
artwork, logo, referral rewards and sample balances are not reused as Siro Cash assets.

## Observations applied

The public wallet screenshot gives balance and direct actions priority, followed by a
compact transaction list. The guide separates internal send from external remittance,
then amount/destination, recipient, and confirmation. The implementation uses these
hierarchy principles, not Yamersal's tariffs, exchange rates or operational promises.

- Home: neutral balance area, aligned four-action row, compact activity hierarchy.
- Send: two destinations first; internal amount, recipient and binding review as
  separate views. Unsupported external methods stay disabled. Device approval,
  uncertain-outcome handling and server capabilities are retained.
- Deposit: dedicated single-purpose shell instead of the general workspace heading,
  tabs and footer stack. Verified address, network controls and scoped history remain.
- Settings: profile and clean menu first. Only the selected settings panel is visible;
  hash links, back navigation, OTP, KYC-off state and session actions are preserved.
- Review replaces the editable form; it no longer appears below a second full form.

## Validation

- Full `npm test`: PASS (offline/mocked boundaries; no live money movement).
- Next.js webpack production compilation: PASS.
- Browser harness: 64 renders (8 screens × 4 widths × Arabic/English), Chromium, actual React/CSS, local synthetic data, no production
  credentials. Covers Arabic/English and four viewport widths. Saved images were
  visually inspected and action alignment, settings rows, QR size and focus styling
  corrected after inspection. See `tests/visual/README.md`.
- A fixture screenshot is not a claim of production login/device acceptance.
- No financial configuration, production deployment, fee or database migration changed.
