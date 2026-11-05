# قائمة شراء VPS — VPSDime 4GB (5 نوفمبر 2026)

القرار: شراء VPS بيد المالك. لا يمتلك الوكيل وسيلة دفع ولن يطلب بيانات دفع أو كلمات مرور. هذه القائمة لا تنقل الإنتاج ولا تغيّر أي إعداد في Vercel أو Supabase.

## ما ثبت مسبقًا عن VPSDime (من موقعه الرسمي وقت المراجعة)
- Linux VPS 4GB RAM / 2 CPU / 20GB SSD / 1TB نقل — **5$ شهريًا فعليًا** بلا عقد، و6GB/4CPU/30GB بـ 7$.
- يعلن قبول USDT وBTC، IPv4 مخصص، دعم Docker، نسخ احتياطي ليلي اختياري بـ 5$.
- الافتراض الاسمي: **virtualization خاصة وليست KVM** — Docker يعمل بحسب المزود لكن يجب التأكد من دعم systemd/cgroups قبل الاعتماد عليه.
- شروط الخدمة: فحص يدوي للحسابات، بند عقوبات عام، استخدام عادل. **قبول عميل مقيم في سوريا غير مثبت**، وشبكة USDT المقبولة غير معلنة.

## المرحلة 1 — أسئلة للدعم قبل أي دفع (انسخها حرفيًا)

1. I am located in Syria. Does your sanctions/compliance policy allow you to accept me as a customer and keep the service active? Please answer explicitly yes or no.
2. For USDT payment, which networks do you accept (BEP20 / Polygon / TRC20 / ERC20)? Is there a minimum or any processing fee on your side?
3. Is the crypto payment processed by you directly or by a third-party gateway (name)? Some gateways block Syrian customers even when the host does not.
4. Does the 5$ monthly price for the 4GB Linux plan apply month-to-month with no setup fee and no mandatory term?
5. Does the 4GB plan support Docker with systemd inside the VPS, outbound HTTPS without restrictions, and inbound ports 80/443? Is there a port-25 or outbound rate limit?
6. Which Linux images are available (Ubuntu 24.04 LTS / Debian 12)? Can I supply my own SSH public key at provisioning?
7. If the account is suspended for compliance review, do you refund unused prepaid time?

لا تدفع قبل إجابة صريحة على 1 و2 و3. أي إجابة مبهمة على السؤال 1 تُعامل كرفض.

## المرحلة 2 — الشراء الآمن
- أنشئ الحساب ببريد تملكه ومفعّل عليه 2FA، وليس بريد الدعم العام للمنصة.
- اختر: الخطة 4GB، Ubuntu 24.04 LTS أو Debian 12، الموقع الأقرب للمستخدمين مع كمون مقبول إلى Supabase (المنطقة الحالية لـ Vercel iad1 = شرق الولايات المتحدة).
- ادفع **شهرًا واحدًا فقط** أولًا. لا نسخ احتياطي مدفوع قبل التحقق من أن الخادم يعمل.
- دفع USDT: استخدم الشبكة التي أكدها الدعم؛ تحقق من عنوان المحفظة ورسوم الشبكة، وأرسل المبلغ بدقة (بعض البوابات ترفض النقص بسنتات). احتفظ بـ TXID.
- **لا تستخدم محفظة التشغيل أو محفظة العهدة الخاصة بالمنصة للدفع.** ادفع من محفظة شخصية منفصلة.

## المرحلة 3 — خلال أول ساعة بعد التسليم (قبل أي شيء من المنصة)
1. سجّل الدخول بـ SSH بالمفتاح، غيّر كلمة مرور root ثم عطّل تسجيل الدخول بكلمة مرور، وأنشئ مستخدمًا غير root مع sudo.
2. فعّل الجدار الناري: السماح بـ 22 (أو منفذ بديل)، 80، 443 فقط. فعّل التحديثات الأمنية التلقائية.
3. تحقق من المواصفات فعليًا: `nproc`، `free -m`، `df -h`، سرعة القرص، واختبار الخروج إلى `api.trongrid.io` و`bsc-rpc.publicnode.com` ومضيف Supabase (منفذ 5432/6543) ونطاق Resend.
4. اختبر Docker: تشغيل حاوية بسيطة وفحص cgroups؛ إن فشل فهذا يغيّر خطة النشر (تشغيل Node مباشرة بـ systemd).
5. سجّل: عنوان IP، نظام التشغيل، نتائج الاختبارات، وأرسلها لي **دون** أي كلمة مرور أو مفتاح خاص.

## ما لا يحدث في هذه المرحلة
- لا نقل نطاق، لا أسرار إنتاج، لا مفاتيح توقيع، لا بيانات عملاء، لا تشغيل مجدول ثانٍ. أي عامل إيداع على الخادم الجديد قبل تسليم الملكية رسميًا يعني مجدولين متوازيين، وهذا ممنوع.
- لا إلغاء Vercel أو تعديل إعداداته؛ الإنتاج يبقى هناك حتى تكتمل خطة النقل في `docs/vercel-account-migration-plan.ar.md` وتُختبر.

## بعد نجاح المرحلة 3
الخطوة التالية بموافقة منفصلة: تجهيز سكربتات الإعداد (Node 22، nginx + TLS، systemd، نسخ احتياطي، مراقبة) واختبار حمل اصطناعي لقياس التكلفة لكل مستخدم، ثم خطة التسليم خطوة بخطوة مع نقطة رجوع.
