import type { Database, SqlValue } from "sql.js";

// Just enough of Cloudflare's D1 API, on top of sql.js, for the worker to run unchanged in a browser.

type Meta = { changes: number; last_row_id: number };

const toSql = (v: unknown): SqlValue =>
  v === undefined || v === null ? null : typeof v === "boolean" ? Number(v) : (v as SqlValue);

class Stmt {
  constructor(private db: Database, private sql: string, private args: unknown[] = []) {}

  bind(...args: unknown[]) {
    return new Stmt(this.db, this.sql, args);
  }

  private rows(): { rows: Record<string, unknown>[]; meta: Meta } {
    const s = this.db.prepare(this.sql);
    try {
      s.bind(this.args.map(toSql));
      const rows: Record<string, unknown>[] = [];
      while (s.step()) rows.push(s.getAsObject());
      const meta = {
        changes: this.db.getRowsModified(),
        last_row_id: Number(this.db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] ?? 0),
      };
      return { rows, meta };
    } finally {
      s.free();
    }
  }

  async all<T = Record<string, unknown>>() {
    const { rows, meta } = this.rows();
    return { results: rows as T[], success: true, meta };
  }

  async first<T = Record<string, unknown>>(col?: string): Promise<T | null> {
    const row = this.rows().rows[0];
    if (!row) return null;
    return (col ? (row[col] as T) : (row as T)) ?? null;
  }

  async run() {
    const { rows, meta } = this.rows();
    return { results: rows, success: true, meta };
  }

  async raw<T = unknown[]>() {
    return this.rows().rows.map((r) => Object.values(r)) as T[];
  }
}

export function d1(db: Database) {
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.all());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}

/** Workers KV, in memory. */
export function memoryKV() {
  const store = new Map<string, string | ArrayBuffer>();
  return {
    async put(key: string, value: string | ArrayBuffer | ArrayBufferView) {
      store.set(
        key,
        typeof value === "string"
          ? value
          : ArrayBuffer.isView(value)
            ? (value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer)
            : value,
      );
    },
    async get(key: string, type?: string) {
      const v = store.get(key);
      if (v === undefined) return null;
      if (type === "json") return JSON.parse(v as string);
      if (type === "arrayBuffer") return typeof v === "string" ? new TextEncoder().encode(v).buffer : v;
      return typeof v === "string" ? v : new TextDecoder().decode(v);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}
