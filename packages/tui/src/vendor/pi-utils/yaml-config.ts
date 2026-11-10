// cloud-pi-tui: adapted from oh-my-pi packages/utils/src/yaml-config.ts (commit
// 83de60ad99). `Bun.YAML.stringify` replaced with the `yaml` package.
// See PATCHES.md.
import { stringify } from "yaml";

const YAML_MAPPING_HEADER_TRAILING_SPACE = /: +$/gm;

/** Serialize config YAML without a trailing space on block mapping headers. */
export function stringifyYamlConfig(value: unknown): string {
	return stringify(value, { indent: 2 }).replace(YAML_MAPPING_HEADER_TRAILING_SPACE, ":");
}
