// cloud-pi-tui: new file. Structural stand-in for `@oh-my-pi/pi-ai` image
// content types. See PATCHES.md.
/**
 * Structural stand-in for `@oh-my-pi/pi-ai`. The TUI only consumes the image
 * content shape, so cloud-pi-tui stays free of the provider client package.
 */

/** A base64-encoded image ready to send to a model. */
export interface ImageContent {
	type: "image";
	/** Base64-encoded image data. */
	data: string;
	/** MIME type such as `image/png`. */
	mimeType: string;
	/** Resolution hint understood by some providers. */
	detail?: "auto" | "low" | "high" | "original";
	/** Optional https mirror of `data`, served by a caller-run blob server. */
	url?: string;
}
