// cloud-pi-vendor: new file. Node SQLite contention, bounded retry, and corruption recovery regressions.
// See PATCHES.md.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Worker } from "node:worker_threads";
import { Database, isSqliteBusyError, openSqliteDatabaseSync } from "../src/sqlite";
import { getDbBusyTimeoutMs } from "../src/env";

let directory: string;
const workers: Worker[] = [];

beforeEach(() => {
	directory = mkdtempSync(path.join(tmpdir(), "cloud-pi-sqlite-test-"));
});

afterEach(async () => {
	await Promise.all(workers.splice(0).map(worker => worker.terminate()));
	rmSync(directory, { recursive: true, force: true });
});

async function lockDatabase(file: string, holdMs: number): Promise<Int32Array> {
	const gate = new Int32Array(new SharedArrayBuffer(4));
	const worker = new Worker(`
		const { parentPort, workerData } = require("node:worker_threads");
		const { DatabaseSync } = require("node:sqlite");
		const gate = new Int32Array(workerData.gate);
		const db = new DatabaseSync(workerData.file);
		db.exec("BEGIN IMMEDIATE; INSERT INTO items VALUES (1)");
		parentPort.postMessage("locked");
		Atomics.wait(gate, 0, 0);
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, workerData.holdMs);
		db.exec("COMMIT");
		db.close();
	`, { eval: true, workerData: { file, holdMs, gate: gate.buffer } });
	workers.push(worker);
	await new Promise<void>((resolve, reject) => {
		worker.once("message", () => resolve());
		worker.once("error", reject);
		worker.once("exit", code => {
			if (code !== 0) reject(new Error(`Lock worker exited ${code}`));
		});
	});
	return gate;
}

function createStore(): string {
	const file = path.join(directory, "cache.db");
	const db = new Database(file);
	try {
		db.exec("PRAGMA journal_mode = WAL; CREATE TABLE items (value INTEGER)");
	} finally {
		db.close();
	}
	return file;
}

describe("SQLite contention", () => {
	it("uses the host busy timeout and accepts an explicit override", () => {
		for (const busyTimeoutMs of [undefined, 25]) {
			const db = new Database(":memory:", { busyTimeoutMs });
			try {
				expect(db.query<{ timeout: number }>("PRAGMA busy_timeout").get()?.timeout)
					.toBe(busyTimeoutMs ?? getDbBusyTimeoutMs());
			} finally {
				db.close();
			}
		}
	});

	it("waits for another worker's writer lock and preserves both writes", async () => {
		const file = createStore();
		const gate = await lockDatabase(file, 100);
		Atomics.store(gate, 0, 1);
		Atomics.notify(gate, 0);
		const count = openSqliteDatabaseSync(file, db => {
			try {
				db.run("INSERT INTO items VALUES (2)");
				return db.query<{ count: number }>("SELECT count(*) AS count FROM items").get()?.count;
			} finally {
				db.close();
			}
		});
		expect(count).toBe(2);
	});

	it("retries transient BUSY failures and eventually writes when the lock is released", async () => {
		const file = createStore();
		const gate = await lockDatabase(file, 100);
		Atomics.store(gate, 0, 1);
		Atomics.notify(gate, 0);
		const count = openSqliteDatabaseSync(file, db => {
			db.run("INSERT INTO items VALUES (2)");
			const count = db.query<{ count: number }>("SELECT count(*) AS count FROM items").get()?.count;
			db.close();
			return count;
		}, {
			busyTimeoutMs: 0,
			maxAttempts: 8,
			retryDelayMs: 20,
		});
		expect(count).toBe(2);
	});

	it("stops after the configured attempts and does not quarantine a busy database", async () => {
		const file = createStore();
		await lockDatabase(file, 0);
		let attempts = 0;
		let caught: unknown;
		try {
			openSqliteDatabaseSync(file, db => {
				attempts++;
				db.run("INSERT INTO items VALUES (2)");
			}, { busyTimeoutMs: 0, maxAttempts: 2, retryDelayMs: 1, recoverCorruption: true });
		} catch (error) {
			caught = error;
		}
		expect(isSqliteBusyError(caught)).toBe(true);
		expect(attempts).toBe(2);
		expect(readdirSync(directory).some(name => name.includes(".corrupt-"))).toBe(false);
	});

	it("still recovers a corrupt store once", () => {
		const file = path.join(directory, "corrupt.db");
		writeFileSync(file, "not a SQLite database");
		let backup: string | undefined;
		const db = openSqliteDatabaseSync(file, db => {
			db.exec("CREATE TABLE recovered (value INTEGER)");
			return db;
		}, { recoverCorruption: true, onCorruptionPreserved: value => { backup = value; } });
		db.close();
		expect(backup).toBeDefined();
		expect(readdirSync(directory).filter(name => name.includes(".corrupt-"))).toHaveLength(1);
	});
});
