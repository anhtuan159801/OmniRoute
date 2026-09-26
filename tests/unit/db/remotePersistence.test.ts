import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";

import { readRemotePersistenceConfig } from "@/lib/db/remotePersistence/config";
import { decryptRemoteSnapshot, encryptRemoteSnapshot } from "@/lib/db/remotePersistence/crypto";

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "server-only-secret",
    SUPABASE_SYNC_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    ...overrides,
  };
}

test("remote persistence is disabled when none of its environment variables are configured", () => {
  assert.equal(readRemotePersistenceConfig({}), null);
});

test("remote persistence requires a complete HTTPS configuration", () => {
  assert.throws(
    () => readRemotePersistenceConfig({ SUPABASE_URL: "https://project.supabase.co" }),
    /all required/
  );
  assert.throws(
    () => readRemotePersistenceConfig(environment({ SUPABASE_URL: "http://project.supabase.co" })),
    /must use HTTPS/
  );
  assert.throws(
    () => readRemotePersistenceConfig(environment({ SUPABASE_SYNC_ENCRYPTION_KEY: "invalid" })),
    /base64 32-byte key/
  );
});

test("encrypted remote snapshots authenticate ciphertext and associated data", () => {
  const key = randomBytes(32);
  const payload = { formatVersion: 1, tables: { provider_connections: [{ id: "credential" }] } };
  const encrypted = encryptRemoteSnapshot(payload, key);

  assert.deepEqual(decryptRemoteSnapshot(encrypted.ciphertext, encrypted.checksum, key), payload);
  assert.throws(
    () =>
      decryptRemoteSnapshot(`${encrypted.ciphertext.slice(0, -4)}AAAA`, encrypted.checksum, key),
    /checksum mismatch/
  );
});
