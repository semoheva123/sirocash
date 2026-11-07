# أول ساعة بعد تسليم الـ VPS — أوامر جاهزة (Ubuntu 24.04)

تُنفَّذ بالترتيب من حاسوبك (PowerShell على Windows 11). استبدل `SERVER_IP` بعنوان الخادم. لا ترسل كلمات المرور أو المفاتيح الخاصة لأحد.

## 0. على حاسوبك: أنشئ مفتاح SSH إن لم يكن موجودًا
```powershell
ssh-keygen -t ed25519 -C "srv1"
type $env:USERPROFILE\.ssh\id_ed25519.pub
```
انسخ السطر الناتج (المفتاح العام) — ستحتاجه في الخطوة 2.

## 1. أول دخول وتغيير كلمة مرور root فورًا
```powershell
ssh root@SERVER_IP
```
ثم داخل الخادم:
```bash
passwd
```
ضع كلمة مرور جديدة طويلة من مدير كلمات المرور (تُستخدم للطوارئ من لوحة المزود فقط).

## 2. مستخدم إداري غير root + مفتاح SSH
```bash
adduser ops            # اختر كلمة مرور قوية لأوامر sudo
usermod -aG sudo ops
mkdir -p /home/ops/.ssh && chmod 700 /home/ops/.ssh
nano /home/ops/.ssh/authorized_keys     # الصق سطر المفتاح العام، ثم Ctrl+O, Enter, Ctrl+X
chmod 600 /home/ops/.ssh/authorized_keys
chown -R ops:ops /home/ops/.ssh
```
**لا تغلق هذه الجلسة.** افتح نافذة PowerShell ثانية واختبر:
```powershell
ssh ops@SERVER_IP
sudo -v
```
إن نجح الدخول بدون كلمة مرور ونجح `sudo -v`، تابع. وإلا راجع الخطوة 2 قبل المتابعة.

## 3. تعطيل الدخول بكلمة المرور ودخول root عبر SSH
في جلسة `ops`:
```bash
sudo tee /etc/ssh/sshd_config.d/10-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
EOF
sudo sshd -t && sudo systemctl restart ssh
```
اختبر من نافذة ثالثة أن `ssh ops@SERVER_IP` ما زال يعمل. بعدها أغلق جلسة root.

## 4. جدار ناري + حماية من تخمين كلمات المرور + تحديثات أمنية تلقائية
```bash
sudo apt update && sudo apt -y full-upgrade
sudo apt -y install ufw fail2ban unattended-upgrades
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades   # اختر Yes
sudo timedatectl set-timezone UTC
sudo reboot
```
بعد دقيقة: `ssh ops@SERVER_IP` للتأكد من عودة الخادم.

## 5. التحقق من المواصفات والاتصال بالخدمات التي تعتمد عليها المنصة
```bash
nproc; free -m; df -h /; lsb_release -d
curl -sS -o /dev/null -w 'trongrid %{http_code} %{time_total}s\n' https://api.trongrid.io/wallet/getnowblock
curl -sS -o /dev/null -w 'bsc %{http_code} %{time_total}s\n' -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' https://bsc-rpc.publicnode.com
curl -sS -o /dev/null -w 'github %{http_code} %{time_total}s\n' https://api.github.com
curl -sS -o /dev/null -w 'resend %{http_code} %{time_total}s\n' https://api.resend.com
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/db.pqzvkhwxarwwcsquhrea.supabase.co/5432' && echo 'supabase 5432 reachable'
ping -c 3 db.pqzvkhwxarwwcsquhrea.supabase.co
```
المطلوب: 4 أنوية، ≈12 GB، ≈60 GB قرص، كل الأسطر تُظهر رمز HTTP (أي رقم، المهم ليس خطأ اتصال)، وSupabase قابل للوصول بكمون ≈15–30 ms من أمستردام.

## 6. اختبار Docker (مهم لأن افتراضية المزود ليست KVM)
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ops && newgrp docker
docker run --rm hello-world
docker info | grep -i -E 'cgroup|storage driver'
```
إن فشل `hello-world` أو ظهر cgroup v1 فقط، أخبرني — نغيّر خطة النشر إلى systemd مباشرة بدل Dokploy.

## 7. ما ترسله لي
- عنوان IP، ناتج `nproc; free -m; df -h /; lsb_release -d`.
- نتائج أسطر curl وping وDocker (نصًا أو صورة).
- **لا** كلمات مرور، لا محتوى `id_ed25519`، لا TXID المحفظة.

## ما لا يُنفَّذ في هذه الساعة
لا نطاق، لا أسرار إنتاج، لا نسخ قاعدة البيانات، لا تشغيل أي عامل إيداع. الإنتاج يبقى على Vercel حتى تُعتمد خطة النقل.
