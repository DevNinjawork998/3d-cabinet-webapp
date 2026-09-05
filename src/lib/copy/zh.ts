import type { Dictionary } from "./en";

/** Simplified Chinese — the Malaysian standard. Typed against `Dictionary`, so
 * a missing key is a compile error rather than a blank on a customer's screen. */
export const zh: Dictionary = {
	meta: {
		title: "Infinite Cabinet · 三维设计您的厨房",
		description:
			"将真实的 Infinite Cabinet 橱柜放入您自己房间的模型中，从各个角度查看，并即时获得报价。无需前往展厅。",
	},
	common: {
		brand: "Infinite Cabinet",
		back: "返回",
		next: "下一步",
		close: "关闭",
		language: "语言",
	},
};
