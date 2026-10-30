# Verification email design

`lib/verification-email.ts` produces signup/sign-in-specific Arabic-first bilingual HTML, plain text, and subject. `lib/email-auth.ts` sends these multipart alternatives through the existing server-side email integration. No OTP appears in the subject or inbox preheader, and no email address, HTML, or URL supplied by a user is interpolated into the template. Only a validated six-digit code and a purpose-specific internal copy choice are used.

The visual identity matches the site's charcoal surface, mint accents, restrained borders, spacious card, and SiroCash wordmark. A single live-text, LTR code block preserves leading zeros and allows copying. Arabic content is RTL; the English section has its own explicit language/direction. Clear 10-minute, single-use, and do-not-share guidance accompanies both alternatives. The template does not claim regulatory approval or financial guarantees.

Email compatibility uses presentation tables, inline styles, system fonts, solid background fallbacks, a fixed-width Outlook wrapper, and a small-screen media query. Gradients and rounded corners are progressive enhancements; unsupported clients still receive legible content. There are no external images, fonts, scripts, tracking pixels, forms, or provider branding in the message body. Actual appearance can differ in forced dark mode and Outlook; inbox-client rendering and real delivery have not been tested automatically.

Run `npm run email:preview` to regenerate `docs/previews/verification-email.html`. It is conspicuously labelled as a visual preview and contains a nonfunctional example code, not an active account challenge. Run `npm run test:email-template` for validation, copy, direction, plain-text, and safety checks. Existing verification, expiration, attempt limits, and session handling remain unchanged.

The selected trial sender remains restricted to the email address of the email-service account. Design changes do not remove that provider restriction or verify API-key validity/delivery.
