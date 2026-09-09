import { DatabaseSync } from "node:sqlite";
import { lstatSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import {
  SQLiteStore,
  tables,
  type Table,
  type StateTables,
} from "../../state/index.js";
import type { Scope } from "../../contracts/index.js";
/** Uses F0 migrations and its BEGIN IMMEDIATE / CAS UnitOfWork unchanged. */
export class DurableSQLiteStore extends SQLiteStore {
  private readonly reader: DatabaseSync;
  constructor(path: string) {
    if (!isAbsolute(path)) throw new Error("ABSOLUTE_STORE_PATH_REQUIRED");
    const dir = lstatSync(dirname(path));
    if (
      !dir.isDirectory() ||
      dir.isSymbolicLink() ||
      dir.uid !== process.getuid?.() ||
      (dir.mode & 0o777) !== 0o700
    )
      throw new Error("PRIVATE_DIRECTORY_REQUIRED");
    for (const file of [path, path + "-wal", path + "-shm"]) {
      try {
        const stat = lstatSync(file);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.uid !== dir.uid ||
          stat.nlink !== 1
        )
          throw new Error("UNSAFE_STORE_PATH");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    super(path);
    this.reader = new DatabaseSync(path, { readOnly: true });
    this.reader.exec("PRAGMA busy_timeout=5000");
  }
  /** Discovery only; every mutation must recheck the row inside a transaction. */
  scan<K extends Table>(table: K, after = "", limit = 1000): StateTables[K][] {
    if (
      !tables.includes(table) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    )
      throw new Error("INVALID_SCAN");
    return this.reader
      .prepare(`SELECT body FROM "${table}" WHERE id > ? ORDER BY id LIMIT ?`)
      .all(after, limit)
      .map((r) => JSON.parse(String(r.body)) as StateTables[K]);
  }
  /** Conservative account/line FIFO also serializes cross-conversation admin operations. */
  predecessors(id: string, scope: Scope): boolean {
    return !!this.reader
      .prepare(
        `SELECT 1 FROM outbox WHERE rowid < (SELECT rowid FROM outbox WHERE id=?) AND json_extract(body,'$.scope.projectId')=? AND json_extract(body,'$.scope.accountId')=? AND json_extract(body,'$.scope.lineId')=? AND json_extract(body,'$.result.status') IN ('queued','blocked','unknown-outcome') LIMIT 1`,
      )
      .get(id, scope.projectId, scope.accountId, scope.lineId);
  }
  override close(): void {
    this.reader.close();
    super.close();
  }
}
