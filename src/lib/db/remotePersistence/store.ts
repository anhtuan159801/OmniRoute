import type { RemotePersistenceConfig } from "./config";

type SnapshotRow = {
  format_version: number;
  revision: number;
  ciphertext: string;
  checksum: string;
};

export function createRemoteSnapshotStore(config: RemotePersistenceConfig) {
  const headers = {
    apikey: config.secretKey,
    Authorization: `Bearer ${config.secretKey}`,
    "Content-Type": "application/json",
  };
  const url = `${config.url}/rest/v1/omniroute_config_snapshots`;
  return {
    async load(): Promise<SnapshotRow | null> {
      const res = await fetch(
        `${url}?instance_id=eq.${encodeURIComponent(config.instanceId)}&select=format_version,revision,ciphertext,checksum`,
        { headers }
      );
      if (!res.ok) throw new Error(`[Remote persistence] fetch failed (${res.status})`);
      const rows = (await res.json()) as SnapshotRow[];
      return rows[0] ?? null;
    },
    async save(row: SnapshotRow, expectedRevision: number): Promise<void> {
      const res = await fetch(`${config.url}/rest/v1/rpc/upsert_omniroute_config_snapshot`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_instance_id: config.instanceId,
          p_expected_revision: expectedRevision,
          p_format_version: row.format_version,
          p_revision: row.revision,
          p_ciphertext: row.ciphertext,
          p_checksum: row.checksum,
        }),
      });
      if (res.status === 409)
        throw new Error("[Remote persistence] revision conflict; another writer is active");
      if (!res.ok) throw new Error(`[Remote persistence] upload failed (${res.status})`);
    },
  };
}
