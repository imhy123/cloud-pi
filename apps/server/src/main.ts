import { mkdir } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

const dataDirectory = process.env.CLOUD_PI_DATA_DIR ?? join(homedir(), ".cloud-pi/agent");
const port = Number(process.env.CLOUD_PI_PORT ?? 4780);

await mkdir(dataDirectory, { recursive: true });
const harness = await Harness.open(
	await openNodeSqliteStorage(join(dataDirectory, "server.sqlite")),
	{ models: createModels(), registry: createRegistry() },
	BACKGROUND_CONTEXT,
);
const conversation = await harness.root(BACKGROUND_CONTEXT);
// Continue any run a previous process left unfinished.
harness.resume();

const server = createServer(async (request, response) => {
	if (request.method !== "GET" || request.url !== "/health") {
		respond(response, 404, { error: "not_found" });
		return;
	}
	try {
		const inspection = await harness.inspect(BACKGROUND_CONTEXT);
		respond(response, 200, {
			ok: true,
			conversation: conversation.id,
			scheduling: inspection.scheduling,
			tasks: inspection.tasks.length,
			submissions: inspection.submissions.length,
		});
	} catch (error) {
		respond(response, 500, { error: error instanceof Error ? error.message : String(error) });
	}
});

server.listen(port, "127.0.0.1", () => {
	console.log(`cloud-pi server listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, async () => {
		server.close();
		await harness.close(BACKGROUND_CONTEXT);
		process.exit(0);
	});
}

function respond(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}
