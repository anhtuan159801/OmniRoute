---
title: "OmniRoute on Koyeb with encrypted Supabase snapshots"
---

# Deploy OmniRoute on Koyeb

Deploy a Koyeb **Web Service** from the repository root using the root `Dockerfile`.
Use Dockerfile builds, not buildpacks. Expose one HTTP port, retain Koyeb's runtime `PORT`
variable, and configure `GET /api/health` as the HTTP health check.

## Free-tier note

The 0.1 vCPU / 512 MB plan is suitable only for a low-traffic smoke test. The image build can
exceed the available build memory; build and publish the image in GitHub Actions or another
registry, then configure Koyeb to deploy that image. Keep exactly one instance: encrypted
Supabase configuration persistence is single-writer by design.

## Required Koyeb secrets

Set these as Koyeb Secrets, never in Git, Docker build arguments, or `NEXT_PUBLIC_*` variables:

```text
JWT_SECRET=<openssl rand -base64 48>
API_KEY_SECRET=<openssl rand -hex 32>
STORAGE_ENCRYPTION_KEY=<openssl rand -base64 32>
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_SYNC_ENCRYPTION_KEY=<base64 32-byte key>
SUPABASE_SYNC_INSTANCE_ID=default
AUTH_COOKIE_SECURE=true
REQUIRE_API_KEY=true
NEXT_PUBLIC_BASE_URL=https://router.example.com
```

Rotate any secret pasted into a chat or committed to source control before deployment.

## Supabase setup

Run [20260926_omniroute_config_snapshots.sql](../../supabase/migrations/20260926_omniroute_config_snapshots.sql)
in Supabase SQL Editor before the first deployment. It enables RLS, denies browser roles, and
permits only the server role to use atomic snapshot writes.

When a valid snapshot exists, OmniRoute restores it before startup completes. When no row exists,
the initial SQLite configuration is encrypted and seeded once. The snapshot excludes usage,
request logs, prompt artifacts, and caches.

## Rollback and rotation

Keep a local SQLite backup and both encryption keys in a password manager. To rotate the
Supabase snapshot key, make a backup, deploy with a new instance ID and new key, then seed the
new row. Do not delete the old row until recovery is verified.
