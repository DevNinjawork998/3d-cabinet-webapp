"use client";

import { useCopy } from "../CopyContext";
import { chip, listBtn } from "./chrome";
import type { StudioTool } from "./ToolRail";

/** The four tools that open a panel. `select` and `measure` open nothing. */
export type PanelKind = Exclude<StudioTool, "select" | "measure">;

/**
 * The drawer that slides over the left of the canvas.
 *
 * It sits *over* the scene rather than beside it because everything in it is
 * a decision you make and then stop thinking about — what to add, how to
 * look at the run, whether there is a kick board. Keeping four panels' worth
 * of controls permanently on screen is what made the old left rail a column
 * of toggles you had to read past to reach the two you wanted.
 */
export function StudioPanel({
	kind,
	onCloseAction,
	children,
}: {
	kind: PanelKind;
	onCloseAction: () => void;
	children: React.ReactNode;
}) {
	const t = useCopy();
	const title = {
		add: t.planner.panel.addTitle,
		view: t.planner.panel.viewTitle,
		doors: t.planner.panel.doorsTitle,
		defaults: t.planner.panel.defaultsTitle,
	}[kind];
	const hint = {
		add: t.planner.panel.addHint,
		view: t.planner.panel.viewHint,
		doors: t.planner.panel.doorsHint,
		defaults: t.planner.panel.defaultsHint,
	}[kind];

	return (
		<div className="absolute inset-y-0 left-0 z-10 flex w-[296px] max-w-full flex-col border-neutral-200 border-r bg-white shadow-[6px_0_24px_rgba(0,0,0,.06)]">
			<div className="flex items-start justify-between gap-2.5 border-[#f0efec] border-b px-3.5 pt-3.5 pb-2.5">
				<div>
					<p className="font-semibold text-[13px]">{title}</p>
					<p className="mt-0.5 text-[12px] text-neutral-500 leading-4">
						{hint}
					</p>
				</div>
				<button
					type="button"
					onClick={onCloseAction}
					aria-label={t.planner.panel.close}
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[14px] text-neutral-600 hover:bg-[#f4f3f1] hover:text-neutral-900"
				>
					✕
				</button>
			</div>
			<div className="flex-1 overflow-y-auto p-3.5">{children}</div>
		</div>
	);
}

/** One stacked option — label over hint. The View and Doors bodies' unit. */
export function PanelOption({
	label,
	hint,
	pressed,
	onPressAction,
}: {
	label: string;
	hint: string;
	pressed: boolean;
	onPressAction: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPressAction}
			aria-pressed={pressed}
			className={listBtn(pressed)}
		>
			<span className="font-semibold text-[13px]">{label}</span>
			<span className="text-[11px] text-neutral-500 leading-[15px]">
				{hint}
			</span>
		</button>
	);
}

/** A labelled pair of chips with a note under it — the Defaults body's unit. */
export function PanelToggle<T extends string | number | boolean>({
	label,
	hint,
	value,
	options,
	onPickAction,
}: {
	label: string;
	hint: string;
	value: T;
	options: { value: T; label: string }[];
	onPickAction: (value: T) => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<p className="font-medium text-[12px] text-neutral-700">{label}</p>
			<div className="flex flex-wrap gap-1">
				{options.map((option) => (
					<button
						key={String(option.value)}
						type="button"
						onClick={() => onPickAction(option.value)}
						aria-pressed={option.value === value}
						className={chip(option.value === value)}
					>
						{option.label}
					</button>
				))}
			</div>
			<p className="text-[11px] text-[#8a857c] leading-[15px]">{hint}</p>
		</div>
	);
}
