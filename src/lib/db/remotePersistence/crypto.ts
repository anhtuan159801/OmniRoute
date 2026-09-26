import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const AAD = Buffer.from("omniroute:supabase-snapshot:v1");
const MAX_BYTES = 10 * 1024 * 1024;

function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function encryptRemoteSnapshot(payload: unknown, key: Buffer) {
  const plaintext = Buffer.from(JSON.stringify(payload));
  if (plaintext.length > MAX_BYTES) throw new Error("[Remote persistence] snapshot is too large");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
  return { ciphertext: Buffer.from(envelope).toString("base64"), checksum: checksum(envelope) };
}

export function decryptRemoteSnapshot(
  ciphertext: string,
  expectedChecksum: string,
  key: Buffer
): unknown {
  if (
    typeof ciphertext !== "string" ||
    ciphertext.length > MAX_BYTES * 2 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext)
  )
    throw new Error("[Remote persistence] invalid snapshot encoding");
  const envelope = Buffer.from(ciphertext, "base64").toString("utf8");
  if (checksum(envelope) !== expectedChecksum)
    throw new Error("[Remote persistence] snapshot checksum mismatch");
  let parsed: { version: number; iv: string; tag: string; data: string };
  try {
    parsed = JSON.parse(envelope);
  } catch {
    throw new Error("[Remote persistence] invalid snapshot envelope");
  }
  if (parsed.version !== 1 || !parsed.iv || !parsed.tag || !parsed.data)
    throw new Error("[Remote persistence] unsupported snapshot envelope");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]);
    if (plaintext.length > MAX_BYTES) throw new Error("[Remote persistence] snapshot is too large");
    return JSON.parse(plaintext.toString("utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("too large")) throw error;
    throw new Error("[Remote persistence] snapshot authentication failed");
  }
}
