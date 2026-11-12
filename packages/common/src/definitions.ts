// cloud-pi: new file. Shared localizable text representation.
import type { MessageData } from "./i18n/messages.ts";

/** Text with an optional translation reference and a stable English fallback. */
export interface LocalizedText {
	readonly defaultText: string;
	readonly message?: MessageData;
}
