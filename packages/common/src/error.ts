// cloud-pi: new file. Error carrying namespaced localization data and an optional cause.
import type { MessageData } from "./i18n/messages.ts";

/** A diagnostic with a stable message reference; `message` remains useful in logs. */
export class LocalizedError extends Error {
	readonly messageData: MessageData;

	constructor(message: string, messageData: MessageData, options?: ErrorOptions) {
		super(message, options);
		this.name = "LocalizedError";
		this.messageData = messageData;
	}
}
