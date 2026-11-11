// cloud-pi-tui: new file. Image entry including SVG components, asynchronous rasterization, fonts and worker shutdown.
// See PATCHES.md.
// Inline image rendering: Kitty and iTerm2 protocols, image budget, and placeholder grids.
export * from "../src/components/image";
export * from "../src/kitty-graphics";
export {
	calculateImageRows,
	encodeITerm2,
	encodeKittyDeleteAllImages,
	encodeKittyDeleteImage,
	encodeKittyDeletePlacement,
	encodeKittyTransmit,
	getGifDimensions,
	getImageDimensions,
	getJpegDimensions,
	getPngDimensions,
	getWebpDimensions,
	type ImageDimensions,
	ImageProtocol,
	type ImageRenderOptions,
	imageFallback,
	isImageProtocolForced,
	iterm2ImagePayload,
	renderImage,
	resolveImageProtocol,
	resolveWarpImageProtocol,
	setTerminalImageProtocol,
} from "../src/terminal-capabilities";

export * from "../src/chat/svg-source";
export * from "../src/chat/svg-figure";
export * from "../src/chat/figure-markdown";
export { rasterizeSvg, setSvgFontOptions, closeMediaWorkers } from "../src/compat/render-worker";
export type { SvgCell, SvgFontOptions } from "../src/compat/render-worker";
