// cloud-pi-vendor: adapted copy of oh-my-pi packages/utils/src/sqlite.ts
// (commit e325ffc73ab8; v18.18.7). Node SQLite adapter with bounded BUSY waits/retries; native locks and salvage helpers are omitted.
// See PATCHES.md.
/**
 * Minimal synchronous SQLite surface shared by the vendored catalog.
 *
 * `node:sqlite` exposes the same statement primitives as `bun:sqlite` but not
 * Bun's database-level `run`/`query`/`transaction` helpers, so this module
 * wraps a {@link DatabaseSync} in a small adapter and keeps the cache code
 * unchanged.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as logger from "./logger";
import { getDbBusyTimeoutMs } from "./env";

const BUSY_MAX_ATTEMPTS = 4;
const BUSY_BASE_DELAY_MS = 100;
const retrySleeper = new Int32Array(new SharedArrayBuffer(4));

function validateInteger(name: string, value: number, min: number): void {
	if (!Number.isSafeInteger(value) || value < min || value > 2_147_483_647) {
		throw new RangeError(`${name} must be an integer between ${min} and 2147483647`);
	}
}

export type SqlParam = null | number | bigint | string | Uint8Array;

interface StatementSyncLike {
	get(...params: SqlParam[]): unknown;
	all(...params: SqlParam[]): unknown[];
	run(...params: SqlParam[]): RunResult;
}

interface DatabaseSyncLike {
	prepare(sql: string): StatementSyncLike;
	exec(sql: string): void;
	close(): void;
}

// esbuild rewrites `node:`-prefixed imports for modules it does not recognize
// as builtins; the runtime lookup keeps the specifier intact.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as {
	DatabaseSync: new (file: string, options?: { readOnly?: boolean }) => DatabaseSyncLike;
};

export interface RunResult {
	changes: number;
	lastInsertRowid: number | bigint;
}

export interface Statement<Row = unknown, Params extends SqlParam[] = SqlParam[]> {
	get(...params: Params): Row | null;
	all(...params: Params): Row[];
	run(...params: Params): RunResult;
	finalize(): void;
}

class NodeStatement<Row, Params extends SqlParam[]> implements Statement<Row, Params> {
	#statement: StatementSyncLike;

	constructor(statement: StatementSyncLike) {
		this.#statement = statement;
	}

	get(...params: Params): Row | null {
		return (this.#statement.get(...params) as Row | undefined) ?? null;
	}

	all(...params: Params): Row[] {
		return this.#statement.all(...params) as Row[];
	}

	run(...params: Params): RunResult {
		return this.#statement.run(...params) as RunResult;
	}

	/** Bun statements are finalized explicitly; Node finalizes on GC. */
	finalize(): void {}
}

export type Transaction<T> = (() => T) & { immediate(): T; deferred(): T; exclusive(): T };

export interface DatabaseOptions {
	readonly?: boolean;
	create?: boolean;
	/** Native SQLite lock wait; defaults to the host policy (1s headless, 5s interactive). */
	busyTimeoutMs?: number;
}

export class Database {
	#db: DatabaseSyncLike;

	constructor(file: string, options: DatabaseOptions = {}) {
		const busyTimeoutMs = options.busyTimeoutMs ?? getDbBusyTimeoutMs();
		validateInteger("busyTimeoutMs", busyTimeoutMs, 0);
		this.#db = new DatabaseSync(file, { readOnly: options.readonly === true });
		try {
			this.#db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
		} catch (error) {
			this.#db.close();
			throw error;
		}
	}

	prepare<Row = unknown, Params extends SqlParam[] = SqlParam[]>(sql: string): Statement<Row, Params> {
		return new NodeStatement<Row, Params>(this.#db.prepare(sql));
	}

	query<Row = unknown, Params extends SqlParam[] = SqlParam[]>(sql: string): Statement<Row, Params> {
		return this.prepare<Row, Params>(sql);
	}

	run(sql: string, params: SqlParam[] = []): RunResult {
		return this.prepare(sql).run(...params);
	}

	exec(sql: string): void {
		this.#db.exec(sql);
	}

	transaction<T>(fn: () => T): Transaction<T> {
		const run = (mode: "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE"): T => {
			this.#db.exec(`BEGIN ${mode}`);
			try {
				const result = fn();
				this.#db.exec("COMMIT");
				return result;
			} catch (error) {
				this.#db.exec("ROLLBACK");
				throw error;
			}
		};
		return Object.assign(() => run("DEFERRED"), {
			immediate: () => run("IMMEDIATE"),
			deferred: () => run("DEFERRED"),
			exclusive: () => run("EXCLUSIVE"),
		});
	}

	close(): void {
		this.#db.close();
	}
}

export interface SqliteOpenOptions {
	busyTimeoutMs?: number;
	/** Maximum open/initialization attempts for BUSY/LOCKED, including the first. Default 4. */
	maxAttempts?: number;
	/** Base retry pause in milliseconds; exponential backoff is capped at 1s. Default 100. */
	retryDelayMs?: number;
	/** Replace a corrupt database with a fresh one, preserving the damaged file. */
	recoverCorruption?: boolean;
	/** Called with the backup path after a damaged store was preserved. */
	onCorruptionPreserved?: (backupPath: string) => void;
}

/**
 * SQLite's corruption family. `node:sqlite` reports result codes numerically:
 * 11 (SQLITE_CORRUPT), 26 (SQLITE_NOTADB), and their extended variants.
 */
export function isSqliteCorruptionError(err: unknown): boolean {
	if (err === null || typeof err !== "object") return false;
	if ("errcode" in err && typeof err.errcode === "number") {
		const primary = err.errcode & 0xff;
		return primary === 11 || primary === 26;
	}
	if ("code" in err && typeof err.code === "string") {
		return err.code === "SQLITE_CORRUPT" || err.code === "SQLITE_NOTADB" || err.code.startsWith("SQLITE_CORRUPT_");
	}
	return false;
}

/** SQLite BUSY/LOCKED, including extended numeric result codes. */
export function isSqliteBusyError(error: unknown): boolean {
	if (error === null || typeof error !== "object") {
		return false;
	}
	if ("errcode" in error && typeof error.errcode === "number") {
		const primary = error.errcode & 0xff;
		return primary === 5 || primary === 6;
	}
	if ("code" in error && typeof error.code === "string") {
		return /^(?:SQLITE_BUSY|SQLITE_LOCKED)(?:_|$)/.test(error.code);
	}
	return false;
}

function preserveCorruptDatabase(dbPath: string): string {
	const backupPath = `${dbPath}.corrupt-${Date.now()}`;
	fs.renameSync(dbPath, backupPath);
	for (const suffix of ["-wal", "-shm", "-journal"]) {
		try {
			fs.rmSync(dbPath + suffix, { force: true });
		} catch {}
	}
	return backupPath;
}

/**
 * Opens a store and runs `initialize` on a fresh connection. With corruption
 * recovery enabled a damaged file is moved aside and the initializer retried
 * once; the replacement path is reported before retrying. BUSY/LOCKED retries
 * are bounded and re-run initialize, so use transactions for partial writes.
 */
export function openSqliteDatabaseSync<T>(
	dbPath: string,
	initialize: (db: Database) => T,
	options: SqliteOpenOptions = {},
): T {
	const maxAttempts = options.maxAttempts ?? BUSY_MAX_ATTEMPTS;
	const retryDelayMs = options.retryDelayMs ?? BUSY_BASE_DELAY_MS;
	validateInteger("maxAttempts", maxAttempts, 1);
	validateInteger("retryDelayMs", retryDelayMs, 0);
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	const attempt = (): T => {
		const db = new Database(dbPath, { busyTimeoutMs: options.busyTimeoutMs });
		try {
			return initialize(db);
		} catch (error) {
			db.close();
			throw error;
		}
	};
	let recovered = false;
	for (let index = 0; ; index++) {
		try {
			return attempt();
		} catch (error) {
			if (isSqliteBusyError(error)) {
				if (index + 1 >= maxAttempts) {
					throw error;
				}
				Atomics.wait(retrySleeper, 0, 0, Math.min(retryDelayMs * 2 ** index, 1_000));
				continue;
			}
			if (recovered || !options.recoverCorruption || !isSqliteCorruptionError(error)) {
				throw error;
			}
			const backupPath = preserveCorruptDatabase(dbPath);
			logger.warn("SQLite database corrupt; preserved damaged store before recreating it", {
				path: dbPath,
				backupPath,
				warning: "Stored credentials from this database may require re-login.",
			});
			options.onCorruptionPreserved?.(backupPath);
			recovered = true;
		}
	}
}
