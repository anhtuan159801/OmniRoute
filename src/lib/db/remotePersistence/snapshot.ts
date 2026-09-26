import type { SqliteAdapter } from "../adapters/types";

const TABLES = ["provider_connections", "provider_nodes", "combos", "api_keys"] as const;
const NAMESPACES = [
  "settings",
  "secrets",
  "modelAliases",
  "customModels",
  "disabledModels",
  "pricing",
];

type Row = Record<string, unknown>;
export type RemoteSnapshot = { formatVersion: 1; tables: Record<string, Row[]> };

function columns(db: SqliteAdapter, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name
  );
}

export function exportRemoteSnapshot(db: SqliteAdapter): RemoteSnapshot {
  const tables: Record<string, Row[]> = {};
  for (const table of TABLES) tables[table] = db.prepare(`SELECT * FROM ${table}`).all() as Row[];
  tables.key_value = db
    .prepare(
      `SELECT namespace, key, value FROM key_value WHERE namespace IN (${NAMESPACES.map(() => "?").join(",")})`
    )
    .all(...NAMESPACES) as Row[];
  return { formatVersion: 1, tables };
}

export function importRemoteSnapshot(db: SqliteAdapter, snapshot: unknown): void {
  const input = snapshot as RemoteSnapshot;
  if (!input || input.formatVersion !== 1 || !input.tables)
    throw new Error("[Remote persistence] invalid snapshot payload");
  for (const table of [...TABLES, "key_value"])
    if (!Array.isArray(input.tables[table]))
      throw new Error(`[Remote persistence] invalid table ${table}`);
  db.transaction(() => {
    for (const table of TABLES) db.prepare(`DELETE FROM ${table}`).run();
    db.prepare(
      `DELETE FROM key_value WHERE namespace IN (${NAMESPACES.map(() => "?").join(",")})`
    ).run(...NAMESPACES);
    for (const table of [...TABLES, "key_value"]) {
      const allowed = new Set(columns(db, table));
      for (const row of input.tables[table]) {
        if (!row || typeof row !== "object" || Array.isArray(row))
          throw new Error(`[Remote persistence] invalid row in ${table}`);
        const keys = Object.keys(row);
        if (!keys.length || keys.some((key) => !allowed.has(key)))
          throw new Error(`[Remote persistence] incompatible row in ${table}`);
        db.prepare(
          `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`
        ).run(...keys.map((key) => row[key] ?? null));
      }
    }
  })();
}
