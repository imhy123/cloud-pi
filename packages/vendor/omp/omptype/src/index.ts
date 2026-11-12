// cloud-pi-vendor: verbatim copy of oh-my-pi packages/omptype/src/index.ts
// (commit e325ffc73ab8; v18.18.7).
// See PATCHES.md.
/**
 * omptype — ArkType-compatible schema validation with a lazy JIT runtime.
 *
 * ArkType-compatible `type()`/`Type`, keyword modules, recursive scopes,
 * composition and morph APIs, structured errors, input/output inference, and
 * JSON Schema emission.
 */
export * from "./errors";
export * from "./from-json-schema";
export * from "./infer";
export * from "./ir";
export * from "./json-schema";
export * from "./local-ref";
export * from "./type";
