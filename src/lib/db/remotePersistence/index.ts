import type { SqliteAdapter } from "../adapters/types";
import { readRemotePersistenceConfig } from "./config";
import { decryptRemoteSnapshot, encryptRemoteSnapshot } from "./crypto";
import { exportRemoteSnapshot, importRemoteSnapshot } from "./snapshot";
import { createRemoteSnapshotStore } from "./store";
import { resetAllDbModuleState } from "../stateReset";
import { invalidateDbCache } from "../readCache";

const enabled = new WeakSet<object>();

export async function initializeRemotePersistence(db: SqliteAdapter): Promise<void> {
  if (enabled.has(db as object)) return;
  const config = readRemotePersistenceConfig();
  if (!config) return;
  const store = createRemoteSnapshotStore(config);
  const remote = await store.load();
  let revision = 0;
  if (remote) {
    if (
      remote.format_version !== 1 ||
      !Number.isSafeInteger(remote.revision) ||
      remote.revision < 1
    )
      throw new Error("[Remote persistence] invalid remote revision");
    importRemoteSnapshot(
      db,
      decryptRemoteSnapshot(remote.ciphertext, remote.checksum, config.encryptionKey)
    );
    resetAllDbModuleState();
    invalidateDbCache();
    revision = remote.revision;
    console.log(`[Remote persistence] restored revision ${revision}`);
  } else {
    const encrypted = encryptRemoteSnapshot(exportRemoteSnapshot(db), config.encryptionKey);
    await store.save({ format_version: 1, revision: 1, ...encrypted }, 0);
    revision = 1;
    console.log("[Remote persistence] created initial snapshot");
  }
  enabled.add(db as object);
  let fingerprint = JSON.stringify(exportRemoteSnapshot(db));
  let uploading = false;
  const timer = setInterval(() => {
    if (uploading) return;
    void (async () => {
      const next = JSON.stringify(exportRemoteSnapshot(db));
      if (next === fingerprint) return;
      uploading = true;
      const encrypted = encryptRemoteSnapshot(JSON.parse(next), config.encryptionKey);
      const nextRevision = revision + 1;
      await store.save({ format_version: 1, revision: nextRevision, ...encrypted }, revision);
      revision = nextRevision;
      fingerprint = next;
    })()
      .catch((error: unknown) =>
        console.error(
          "[Remote persistence] upload failed; retrying:",
          error instanceof Error ? error.message : "unknown"
        )
      )
      .finally(() => {
        uploading = false;
      });
  }, 2_000);
  timer.unref?.();
}
