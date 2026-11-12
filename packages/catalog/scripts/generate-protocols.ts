// cloud-pi-catalog: adapted copy of oh-my-pi packages/catalog/scripts/generate-protocols.ts
// (commit e325ffc73ab8; v18.18.7). Node fs.globSync and fs read/write replace Bun.Glob/Bun.file/Bun.write.
// See PATCHES.md.
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateProtoTs, ProtoContext, parseProto } from "./proto-parser";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// The `.proto` inputs and consumer scans live in an oh-my-pi checkout.
const PACKAGES_DIR = process.env.OH_MY_PI_DIR
	? path.join(process.env.OH_MY_PI_DIR, "packages")
	: path.resolve(SCRIPT_DIR, "../../..", "..", "oh-my-pi", "packages");
const CURSOR_PROTO = path.join(PACKAGES_DIR, "ai/src/providers/cursor/proto/agent.proto");
const CURSOR_MODELS_PROTO = path.join(PACKAGES_DIR, "catalog/src/discovery/cursor-models.proto");
const DEVIN_PROTO_DIR = path.join(PACKAGES_DIR, "ai/src/providers/devin/proto");
const DISCOVERY_DIR = path.resolve(SCRIPT_DIR, "../src/discovery");

const CURSOR_CONSUMER_DIRS = [
	path.join(PACKAGES_DIR, "ai/src"),
	path.join(PACKAGES_DIR, "ai/test"),
	path.join(PACKAGES_DIR, "catalog/src"),
	path.join(PACKAGES_DIR, "catalog/test"),
	path.join(PACKAGES_DIR, "coding-agent/test"),
];

const CURSOR_ENUMS = [
	"CursorError",
	"CursorRuleSource",
	"ForceBackgroundShellStatus",
	"ForceBackgroundSubagentStatus",
	"ModelVendorId",
];
const DEVIN_MESSAGES = [
	"exa.api_server_pb.AssignModelRequest",
	"exa.api_server_pb.AssignModelResponse",
	"exa.chat_pb.ChatMessagePrompt",
	"exa.codeium_common_pb.ChatToolCall",
	"exa.chat_pb.ChatToolChoice",
	"exa.chat_pb.ChatToolDefinition",
	"exa.codeium_common_pb.ClientModelConfig",
	"exa.codeium_common_pb.CompletionConfiguration",
	"exa.seat_management_pb.ExchangePKCEAuthorizationCodeRequest",
	"exa.seat_management_pb.ExchangePKCEAuthorizationCodeResponse",
	"exa.api_server_pb.GetChatMessageRequest",
	"exa.api_server_pb.GetChatMessageResponse",
	"exa.api_server_pb.GetCliModelConfigsRequest",
	"exa.api_server_pb.GetCliModelConfigsResponse",
	"exa.auth_pb.GetUserJwtRequest",
	"exa.auth_pb.GetUserJwtResponse",
	"exa.seat_management_pb.GetUserStatusRequest",
	"exa.seat_management_pb.GetUserStatusResponse",
	"exa.codeium_common_pb.ImageData",
	"exa.codeium_common_pb.Metadata",
	"exa.codeium_common_pb.ModelUsageStats",
	"exa.chat_pb.PromptCacheOptions",
	"exa.codeium_common_pb.ModelInfo",
	"exa.codeium_common_pb.ModelFeatures",
];
const DEVIN_ENUMS = [
	"BillingStrategy",
	"CacheControlType",
	"ChatMessageRequestType",
	"ChatMessageSource",
	"ConversationalPlannerMode",
	"StopReason",
	"TeamsTier",
];

async function collectCursorMessages(): Promise<string[]> {
	const symbols = new Set<string>();
	const importPattern = /import(?:\s+type)?\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];/g;
	const sourceFiles = await collectTypeScriptFiles(CURSOR_CONSUMER_DIRS);

	for (const sourceFile of sourceFiles) {
		const source = await fsp.readFile(sourceFile, "utf8");
		for (const match of source.matchAll(importPattern)) {
			const modulePath = match[2];
			if (!modulePath.endsWith("cursor-proto")) continue;
			for (const specifier of match[1].split(",")) {
				const symbol = specifier
					.trim()
					.replace(/^type\s+/, "")
					.replace(/\s+as\s+.+$/, "");
				if (!symbol) continue;
				symbols.add(symbol.endsWith("Schema") ? symbol.slice(0, -6) : symbol);
			}
		}
	}

	for (const enumName of CURSOR_ENUMS) symbols.delete(enumName);
	if (symbols.size === 0) throw new Error("No Cursor protocol consumers found");
	return [...symbols].sort();
}

async function collectTypeScriptFiles(directories: string[]): Promise<string[]> {
	const files: string[] = [];
	for (const directory of directories) {
		for (const relativePath of fs.globSync("**/*.ts", { cwd: directory })) {
			files.push(path.join(directory, relativePath));
		}
	}
	return files.sort();
}

async function parseProtoDirectory(directory: string): Promise<ProtoContext> {
	const context = new ProtoContext();
	const paths = fs.globSync("**/*.proto", { cwd: directory });

	for (const relativePath of paths.sort()) {
		const source = await fsp.readFile(path.join(directory, relativePath), "utf8");
		context.addFile(parseProto(source, relativePath));
	}
	return context;
}

async function generateProtocols(): Promise<void> {
	const cursorSource = await fsp.readFile(CURSOR_PROTO, "utf8");
	const cursorModelsSource = await fsp.readFile(CURSOR_MODELS_PROTO, "utf8");
	const cursorContext = new ProtoContext();
	cursorContext.addFile(parseProto(cursorSource, "agent.proto"));
	cursorContext.addFile(parseProto(cursorModelsSource, "cursor-models.proto"));

	const cursor = generateProtoTs(cursorContext, {
		includeMessages: await collectCursorMessages(),
		includeEnums: CURSOR_ENUMS,
		includeDependencies: true,
		packagePrefix: "Cursor agent",
		protobufImportPath: "./protobuf",
	});
	const devin = generateProtoTs(await parseProtoDirectory(DEVIN_PROTO_DIR), {
		includeMessages: DEVIN_MESSAGES,
		includeEnums: DEVIN_ENUMS,
		includeDependencies: true,
		packagePrefix: "Devin",
		protobufImportPath: "./protobuf",
	});

	await fsp.writeFile(path.join(DISCOVERY_DIR, "cursor-proto.ts"), `${cursor}\n`);
	await fsp.writeFile(path.join(DISCOVERY_DIR, "devin-proto.ts"), `${devin}\n`);
}

await generateProtocols();
