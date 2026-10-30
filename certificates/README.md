# Supabase public database CA

`supabase-prod-ca-2021.crt` is a **public CA certificate, not a private key or application credential**. It is provided for auditability; runtime trust is configured explicitly through SiroCash's server-only `DATABASE_SSL_CA` variable.

- HTTPS source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- Source verification: Supabase's official dashboard uses `ssl:certificate_url` from https://github.com/supabase/supabase/blob/2afde3d093383cd5df76ac7377a5ef7588d1af98/apps/studio/hooks/custom-content/custom-content.json and `env=prod` in its SSLConfiguration component.
- SHA-256 X.509 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
- Subject: Supabase Root 2021 CA, Supabase Inc.
- Valid through 2031-04-26 10:56:53 UTC. Recheck the official provider source before replacement/rotation.

Certificate verification and hostname verification remain enabled. Never fix a TLS failure with `rejectUnauthorized: false` or by trusting an unauthenticated certificate from the network peer.
