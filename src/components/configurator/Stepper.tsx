// No "use client" here on purpose: these panels are only ever rendered by the
// configurator page, which is a client entry already. Marking them as entries
// too would force every callback prop to be named like a Server Action.

import type { RoomSize } from "@/lib/wardrobe/room";
import type { ValidationIssue } from "@/lib/wardrobe/rules";
import type { DesignDocument } from "@/lib/wardrobe/schema";

/**
 * The five steps of the configurator. Each has a sensible default already in
 * the document, so pressing next four times still lands on something that
 * looks good in 3D.
 */
export const STEPS = [
	"Measure your space",
	"Bay split",
	"Fit out",
	"Doors and finish",
	"Price",
] as const;

export type StepIndex = 0 | 1 | 2 | 3 | 4;

/** What every step panel gets. Steps edit the document; nothing else does. */
export type StepProps = {
	design: DesignDocument;
	room: RoomSize;
	onDesign: (next: DesignDocument) => void;
	onRoom: (patch: Partial<RoomSize>) => void;
};

/**
 * Validation issues carry the document path that failed, which is enough to
 * put each one under the step that can actually fix it. Anything unrecognised
 * surfaces on the measuring step rather than vanishing.
 */
export function issuesForStep(
	issues: ValidationIssue[],
	step: StepIndex,
): ValidationIssue[] {
	return issues.filter((issue) => {
		if (issue.path.startsWith("bays")) return step === 1;
		if (issue.path.startsWith("opening")) return step === 0;
		return step === 0;
	});
}

export function Stepper({
	step,
	onStep,
	issues,
	children,
}: {
	step: StepIndex;
	onStep: (next: StepIndex) => void;
	issues: ValidationIssue[];
	children: React.ReactNode;
}) {
	const stepIssues = issuesForStep(issues, step);

	return (
		<div className="flex h-full flex-col gap-4">
			<ol className="flex flex-wrap gap-1 text-xs">
				{STEPS.map((label, i) => {
					const index = i as StepIndex;
					const active = index === step;
					return (
						<li key={label}>
							<button
								type="button"
								onClick={() => onStep(index)}
								aria-current={active ? "step" : undefined}
								className={`rounded-full px-2 py-1 transition ${
									active
										? "bg-neutral-900 text-white"
										: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
								}`}
							>
								{i + 1}. {label}
							</button>
						</li>
					);
				})}
			</ol>

			<div className="flex-1 space-y-5 overflow-y-auto">{children}</div>

			{stepIssues.length > 0 && (
				<ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm">
					{stepIssues.map((issue) => (
						<li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
					))}
				</ul>
			)}

			<div className="flex gap-2">
				<button
					type="button"
					disabled={step === 0}
					onClick={() => onStep(Math.max(0, step - 1) as StepIndex)}
					className="rounded-full border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40"
				>
					Back
				</button>
				<button
					type="button"
					disabled={step === STEPS.length - 1}
					onClick={() =>
						onStep(Math.min(STEPS.length - 1, step + 1) as StepIndex)
					}
					className="flex-1 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
				>
					Next
				</button>
			</div>
		</div>
	);
}
