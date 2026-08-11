import { DOOR_TYPES, FINISHES } from "@/lib/wardrobe/catalogue";
import { type DoorPatch, setAllDoors, setDoor } from "@/lib/wardrobe/edits";
import {
	DOOR_TYPE_IDS,
	FINISH_IDS,
	HANDLE_IDS,
	type HandleId,
} from "@/lib/wardrobe/schema";
import { BayPicker } from "./BayPicker";
import type { StepProps } from "./Stepper";

/** Finish ids bucketed by their catalogue group, for the swatch picker. */
const FINISH_GROUPS = (["Laminate", "Veneer"] as const).map(
	(group) =>
		[group, FINISH_IDS.filter((id) => FINISHES[id].group === group)] as const,
);

const HANDLE_LABELS: Record<HandleId, string> = {
	none: "None",
	profile: "Profile bar",
	knob: "Knob",
};

export function StepDoors({
	design,
	onDesign,
	selectedBayId,
	onSelectBay,
	perBay,
	onPerBay,
}: StepProps & {
	selectedBayId: string;
	onSelectBay: (bayId: string) => void;
	perBay: boolean;
	onPerBay: (next: boolean) => void;
}) {
	const door =
		design.doors.find((d) => d.bayId === selectedBayId) ?? design.doors[0];
	if (!door) return null;

	// Most customers want one finish across the run; the per-bay switch is for
	// the ones who want a feature bay.
	const apply = (patch: DoorPatch) =>
		onDesign(
			perBay ? setDoor(design, door.bayId, patch) : setAllDoors(design, patch),
		);

	return (
		<>
			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={perBay}
					onChange={(e) => onPerBay(e.target.checked)}
				/>
				<span>Different doors per bay</span>
			</label>

			{perBay && (
				<BayPicker
					design={design}
					selected={door.bayId}
					onSelect={onSelectBay}
				/>
			)}

			<label className="block space-y-2">
				<span className="font-medium text-sm">Door type</span>
				<select
					className="w-full rounded border border-neutral-300 bg-white p-2 text-sm"
					value={door.type}
					onChange={(e) => apply({ type: e.target.value as typeof door.type })}
				>
					{DOOR_TYPE_IDS.map((id) => (
						<option key={id} value={id}>
							{DOOR_TYPES[id].label}
							{DOOR_TYPES[id].surchargeRmPerFt > 0 &&
								` (+RM ${DOOR_TYPES[id].surchargeRmPerFt}/ft)`}
						</option>
					))}
				</select>
			</label>

			<fieldset className="space-y-2">
				<legend className="font-medium text-sm">
					Finish — {FINISHES[door.finish].label}
					<span className="ml-1 font-normal text-neutral-500 text-xs">
						{FINISHES[door.finish].group}
					</span>
				</legend>
				{FINISH_GROUPS.map(([group, ids]) => (
					<div key={group}>
						<p className="mb-1 text-neutral-500 text-xs">{group}</p>
						<div className="grid grid-cols-4 gap-2">
							{ids.map((id) => {
								const finish = FINISHES[id];
								const selected = id === door.finish;
								return (
									<button
										key={id}
										type="button"
										onClick={() => apply({ finish: id })}
										aria-pressed={selected}
										title={`${finish.label} — ${
											finish.surchargeRmPerFt === 0
												? "included"
												: `+RM ${finish.surchargeRmPerFt}/ft`
										}`}
										className={`rounded-md border p-1 text-center ${
											selected
												? "border-neutral-900 ring-1 ring-neutral-900"
												: "border-neutral-200 hover:border-neutral-400"
										}`}
									>
										<span
											className="block h-9 w-full rounded"
											style={{ backgroundColor: finish.swatch }}
										/>
										<span className="mt-1 block truncate text-[11px] leading-tight">
											{finish.label}
										</span>
										<span className="block text-[10px] text-neutral-500">
											{finish.surchargeRmPerFt === 0
												? "included"
												: `+${finish.surchargeRmPerFt}/ft`}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				))}
			</fieldset>

			<fieldset className="space-y-2">
				<legend className="font-medium text-sm">Handle</legend>
				<div className="flex gap-2">
					{HANDLE_IDS.map((id) => (
						<button
							key={id}
							type="button"
							onClick={() => apply({ handle: id })}
							aria-pressed={id === door.handle}
							className={`flex-1 rounded-md border px-2 py-2 text-xs ${
								id === door.handle
									? "border-neutral-900 bg-neutral-50"
									: "border-neutral-200 hover:border-neutral-400"
							}`}
						>
							{HANDLE_LABELS[id]}
						</button>
					))}
				</div>
			</fieldset>
		</>
	);
}
