import type { DesignDocument } from "@/lib/wardrobe/schema";

/** Which bay the fit-out and door steps are editing. */
export function BayPicker({
	design,
	selected,
	onSelect,
}: {
	design: DesignDocument;
	selected: string;
	onSelect: (bayId: string) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1">
			{design.bays.map((bay, i) => (
				<button
					key={bay.id}
					type="button"
					onClick={() => onSelect(bay.id)}
					aria-pressed={bay.id === selected}
					className={`rounded-full px-3 py-1 text-xs transition ${
						bay.id === selected
							? "bg-neutral-900 text-white"
							: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
					}`}
				>
					Bay {i + 1}
				</button>
			))}
		</div>
	);
}
