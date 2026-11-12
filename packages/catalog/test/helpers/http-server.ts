// cloud-pi-catalog: new file. Node http server replaces Bun.serve for Cursor discovery tests.
// See PATCHES.md.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

export interface TestHttpServer {
	readonly url: URL;
	stop(force?: boolean): void;
}

async function bodyOf(request: IncomingMessage): Promise<Buffer | undefined> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(Buffer.from(chunk));
	return chunks.length ? Buffer.concat(chunks) : undefined;
}

function requestOf(request: IncomingMessage, body: Buffer | undefined): Request {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (Array.isArray(value)) for (const item of value) headers.append(name, item);
		else if (value !== undefined) headers.set(name, value);
	}
	const method = request.method ?? "GET";
	return new Request(`http://127.0.0.1${request.url ?? "/"}`, {
		method,
		headers,
		body: method === "GET" || method === "HEAD" || !body ? undefined : new Uint8Array(body),
	});
}

function writeResponse(response: ServerResponse, reply: Response): void {
	response.statusCode = reply.status;
	reply.headers.forEach((value, name) => response.setHeader(name, value));
	void reply.arrayBuffer().then(buffer => response.end(Buffer.from(buffer)));
}

/** Start a loopback HTTP/1 server that dispatches the Bun.serve-style fetch handler. */
export async function serve(handler: (request: Request) => Response | Promise<Response>): Promise<TestHttpServer> {
	const server = createServer(async (request, response) => {
		try {
			writeResponse(response, await handler(requestOf(request, await bodyOf(request))));
		} catch {
			response.statusCode = 500;
			response.end();
		}
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("test server did not bind a TCP port");
	return {
		url: new URL(`http://127.0.0.1:${address.port}/`),
		stop: (force = false) => {
			if (force) server.closeAllConnections();
			server.close();
		},
	};
}
