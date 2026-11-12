// cloud-pi-catalog: adapted copy of oh-my-pi packages/catalog/test/proto-parser.test.ts
// (commit e325ffc73ab8; v18.18.7). Node.js adaptation; see PATCHES.md.
// See PATCHES.md.
import { expect, it } from "vitest";
import { generateProtoTs, parseProto } from "../scripts/proto-parser";

it("emits a requested message's transitive schema and enum dependencies", () => {
	const output = generateProtoTs(
		parseProto(`
			syntax = "proto3";
			package example;

			enum State {
				STATE_UNSPECIFIED = 0;
				STATE_READY = 1;
			}

			message Child {
				string text = 1;
			}

			message Root {
				optional bool enabled = 1;
				Child child = 2;
				State state = 3;
			}

			message Unused {
				string ignored = 1;
			}
		`),
		{ includeMessages: ["example.Root"] },
	);

	expect(output).toContain("export interface Root");
	expect(output).toContain("export interface Child");
	expect(output).toContain("export enum State");
	expect(output).toContain('name: "enabled", kind: "bool", optional: true');
	expect(output).not.toContain("export interface Unused");
});
