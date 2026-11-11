// The client's message catalog. The first locale (`en`) defines the keys and
// their argument types; every other locale must match it, so a missing or
// mistyped message is a compile error. Keys name concepts, never identifiers:
// command names, theme names and key ids stay untranslated.
import { defineMessages } from "@cloud-pi/i18n";

export const messages = defineMessages("client-tui", {
	en: {
		"welcome.tipLabel": "Tip: ",
		"welcome.tip": "Ctrl+C exits Cloud-Pi.",
		"chat.youSaid": (text: string) => `You said: ${text}`,
	},
	"zh-CN": {
		"welcome.tipLabel": "提示：",
		"welcome.tip": "Ctrl+C 退出 Cloud-Pi。",
		"chat.youSaid": (text: string) => `你说：${text}`,
	},
});