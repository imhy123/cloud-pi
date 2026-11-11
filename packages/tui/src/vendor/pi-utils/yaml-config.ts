// cloud-pi-tui: adapted copy of oh-my-pi packages/utils/src/yaml-config.ts
// (commit e325ffc73ab8; v18.18.7). `Bun.YAML.stringify` replaced with the `yaml` package.
// See PATCHES.md.
import { stringify } from "yaml";

const YAML_MAPPING_HEADER_TRAILING_SPACE = /: +$/gm;

/** Serialize config YAML without a trailing space on block mapping headers. */
export function stringifyYamlConfig(value: unknown): string {
	return stringify(value, { indent: 2 }).replace(YAML_MAPPING_HEADER_TRAILING_SPACE, ":");
}
