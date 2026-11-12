// cloud-pi-catalog: verbatim copy of oh-my-pi packages/catalog/src/wire/xiaomi-token-plan.ts
// (commit e325ffc73ab8; v18.18.7).
// See PATCHES.md.
/** Identifies Xiaomi Token Plan keys so login and discovery use regional hosts instead of the pay-as-you-go host. */
export function isXiaomiTokenPlanKey(apiKey: string): boolean {
	return apiKey.startsWith("tp-") || apiKey.startsWith("ttp-");
}
