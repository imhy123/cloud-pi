// cloud-pi-tui: new file. Image entry point: image component, Kitty graphics and terminal image encoding helpers.
// See PATCHES.md.
// Inline image rendering: Kitty and iTerm2 protocols, image budget, and placeholder grids.
export * from "./components/image";
export * from "./kitty-graphics";
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
} from "./terminal-capabilities";
