const NAMES = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SYNC_ENCRYPTION_KEY",
  "SUPABASE_SYNC_INSTANCE_ID",
] as const;

export interface RemotePersistenceConfig {
  url: string;
  secretKey: string;
  encryptionKey: Buffer;
  instanceId: string;
}

export function readRemotePersistenceConfig(
  env: NodeJS.ProcessEnv = process.env
): RemotePersistenceConfig | null {
  if (!NAMES.some((name) => Boolean(env[name]?.trim()))) return null;
  const url = env.SUPABASE_URL?.trim();
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const keyText = env.SUPABASE_SYNC_ENCRYPTION_KEY?.trim();
  if (!url || !secretKey || !keyText) {
    throw new Error(
      "[Remote persistence] SUPABASE_URL, secret key, and encryption key are all required"
    );
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error("[Remote persistence] SUPABASE_URL must use HTTPS");
  }
  const encryptionKey = Buffer.from(keyText, "base64");
  const encoded = encryptionKey.toString("base64").replace(/=+$/, "");
  if (encryptionKey.length !== 32 || encoded !== keyText.replace(/=+$/, "")) {
    throw new Error(
      "[Remote persistence] SUPABASE_SYNC_ENCRYPTION_KEY must be a base64 32-byte key"
    );
  }
  const instanceId = env.SUPABASE_SYNC_INSTANCE_ID?.trim() || "default";
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(instanceId))
    throw new Error("[Remote persistence] invalid instance ID");
  return { url, secretKey, encryptionKey, instanceId };
}
