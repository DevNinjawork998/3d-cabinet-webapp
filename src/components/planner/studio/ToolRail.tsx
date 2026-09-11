"use client";

import { useCopy } from "../CopyContext";

/** The seven things the rail can put you in. `select` is the resting state. */
export type StudioTool =
	| "select"
	| "add"
	| "room"
	| "measure"
	| "view"
	| "doors"
	| "defaults";

/**
 * The glyphs are typed characters, not an icon set.
 *
 * Seven glyphs is not worth a dependency on the mobile budget — the same
 * reasoning as the hand-drawn play triangle in the planner header.
 */
const GLYPH: Record<StudioTool, string> = {
	select: "⌖",
	add: "＋",
	room: "⌂",
	measure: "⟺",
	view: "◱",
	doors: "◫",
	defaults: "⚙",
};

const ORDER: StudioTool[] = [
	"select",
	"add",
	"room",
	"measure",
	"view",
	"doors",
	"defaults",
];

export function ToolRail({
	active,
	onPressAction,
}: {
	active: StudioTool;
	onPressAction: (tool: StudioTool) => void;
}) {
	const t = useCopy();
	const label: Record<StudioTool, string> = {
		select: t.planner.tools.select,
		add: t.planner.tools.add,
		room: t.planner.tools.room,
		measure: t.planner.tools.measure,
		view: t.planner.tools.view,
		doors: t.planner.tools.doors,
		defaults: t.planner.tools.defaults,
	};
	const title: Record<StudioTool, string> = {
		select: t.planner.tools.selectTitle,
		add: t.planner.tools.addTitle,
		room: t.planner.tools.roomTitle,
		measure: t.planner.tools.measureTitle,
		view: t.planner.tools.viewTitle,
		doors: t.planner.tools.doorsTitle,
		defaults: t.planner.tools.defaultsTitle,
	};

	return (
		<nav
			aria-label={t.planner.tools.ariaLabel}
			className="flex shrink-0 flex-row items-center gap-1 border-neutral-200 border-b bg-white px-2 py-1.5 lg:w-[60px] lg:flex-col lg:border-r lg:border-b-0 lg:px-0 lg:py-2"
		>
			{ORDER.map((tool) => {
				const on = tool === active;
				return (
					<button
						key={tool}
						type="button"
						onClick={() => onPressAction(tool)}
						aria-pressed={on}
						title={title[tool]}
						className={`flex min-h-11 w-11 flex-col items-center justify-center gap-[3px] rounded-[9px] border transition ${
							on
								? "border-[#1f5138] bg-[#e7efe9] text-[#17402c]"
								: "border-transparent text-neutral-600 hover:bg-[#f4f3f1]"
						}`}
					>
						<span aria-hidden className="text-[16px] leading-none">
							{GLYPH[tool]}
						</span>
						<span className="text-[9px] leading-none tracking-[0.01em]">
							{label[tool]}
						</span>
					</button>
				);
			})}
		</nav>
	);
}
