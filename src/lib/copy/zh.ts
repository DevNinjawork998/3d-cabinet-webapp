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
	landing: {
		nav: {
			howItWorks: "运作方式",
			gallery: "作品集",
			finishes: "板材选择",
			faq: "常见问题",
			tutorials: "教学视频",
			startPlanning: "开始设计",
			admin: "管理员",
		},
		hero: {
			eyebrow: "免费试用 · 无需注册",
			titleBeforeAccent: "设计您的厨房，尽在",
			titleAccent: "3D",
			subtitle:
				"将真实的 Infinite Cabinet 橱柜放入您自己的房间，边搭配边看价格变化，完成后直接把方案发给我们。",
			cta: "开始设计",
			howItWorks: "运作方式",
			alt: "一间已完工的 Infinite Cabinet 厨房",
		},
		facts: {
			starterKitchenLabel: "入门厨房套组",
			typicalDeliveryValue: "4 至 6 周",
			typicalDeliveryLabel: "平均交货时间",
			warrantyValue: "5 年",
			warrantyLabel: "五金与结构保修",
			noAccountValue: "无需注册",
			noAccountLabel: "即可设计与报价",
		},
		how: {
			heading: "从空白墙面到报价，只需三步",
			step1Title: "选择您的房间",
			step1Detail: "选择厨房、客厅、卧室或玄关，输入您墙面的实际尺寸。",
			step2Title: "按比例放入橱柜",
			step2Detail:
				"在 3D 场景中排列真实的 Infinite Cabinet 橱柜，随意切换板材，直到满意为止。",
			step3Title: "即时获取报价",
			step3Detail:
				"搭配的同时即可看到实时价格，完成后直接把方案发给我们的团队。",
		},
		gallery: {
			heading: "按房间浏览",
			subtitle:
				"每个房间都以真实的 Infinite Cabinet 尺寸和现成的布局开始设计。",
			roomAlt: "{room}橱柜",
			roomSubtitle: {
				kitchen: "真实的 Infinite Cabinet 尺寸",
				living: "电视柜与展示柜",
				bedroom: "衣柜",
				foyer: "鞋柜与长凳",
			},
		},
		finishes: {
			heading: "板材与颜色",
			subtitle: "在设计工具中即可为任何橱柜更换板材。",
		},
		faq: {
			heading: "常见问题",
			q1: "送货需要多久？",
			a1: "确认方案后，大部分订单会在 4 至 6 周内送达，具体视板材和橱柜尺寸而定。",
			q2: "可以顺便安装橱柜吗？",
			a2: "可以。当您把方案发给我们的团队做最终报价时，可以加上安装服务。",
			q3: "橱柜是用什么材料制成的？",
			a3: "实心柜体，可选贴皮、防火板或喷漆等多种表面处理，完整款式请见设计工具。",
			q4: "下单后还能更改设计吗？",
			a4: "只要还没开始生产，修改都是免费的。我们的团队会先与您确认方案。",
			q5: "有提供保修吗？",
			a5: "每个橱柜均享有 5 年五金与结构保修。",
		},
		closing: {
			heading: "您的墙面，您的尺寸，您的价格。只需大约五分钟。",
			subtitle: "无需安装任何软件，也无需注册账号。",
			cta: "开始设计",
		},
		footer: {
			tagline: "量身定制的橱柜，以 3D 设计，并按您房间的实际尺寸打造。",
			productHeading: "产品",
			startPlanning: "开始设计",
			gallery: "作品集",
			faq: "常见问题",
			tutorials: "教学视频",
			contactHeading: "联系我们",
			email: "hello@infinitecabinet.com",
			adminSignIn: "管理员登录",
			copyright: "© 2026 {brand}。版权所有。",
		},
	},
};
