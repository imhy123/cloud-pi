// cloud-pi-tui: verbatim copy of oh-my-pi packages/tui/src/symbols.ts
// (commit e325ffc73ab8; v18.18.7).
// See PATCHES.md.
export interface BoxSymbols {
	topLeft: string;
	topRight: string;
	bottomLeft: string;
	bottomRight: string;
	horizontal: string;
	vertical: string;
	teeDown: string;
	teeUp: string;
	teeLeft: string;
	teeRight: string;
	cross: string;
}

export interface SymbolTheme {
	cursor: string;
	inputCursor: string;
	boxRound: Omit<BoxSymbols, "teeDown" | "teeUp" | "teeLeft" | "teeRight" | "cross">;
	boxSharp: BoxSymbols;
	table: BoxSymbols;
	quoteBorder: string;
	hrChar: string;
	/** Chip glyph drawn (painted with the referenced color) before inline hex colors. */
	colorSwatch?: string;
	spinnerFrames: string[];
}
