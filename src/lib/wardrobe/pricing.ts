import { WARDROBE_CATALOGUE } from "./catalogue";
import type { WardrobeCatalogue } from "./catalogueSchema";
import type { DesignDocument } from "./schema";

export type PriceLineItem = { label: string; amountRm: number };

export type PriceBreakdown = {
	runFt: number;
	base: PriceLineItem;
	finishSurcharges: PriceLineItem[];
	doorTypeSurcharges: PriceLineItem[];
	accessories: PriceLineItem[];
	totalRm: number;
};

export function computePrice(
	design: DesignDocument,
	catalogue: WardrobeCatalogue = WARDROBE_CATALOGUE,
): PriceBreakdown {
	const { finishes, doorTypes, accessories: accessoryRates, rates } = catalogue;
	const mmToFt = (mm: number) => mm / rates.mmPerFt;

	const runFt = mmToFt(design.opening.width);
	const base: PriceLineItem = {
		label: `Base (${runFt.toFixed(2)} ft run)`,
		amountRm: rates.baseRmPerFt * runFt,
	};

	const bayWidthById = new Map(design.bays.map((bay) => [bay.id, bay.width]));

	// Customers count bays from the left; `bay-1` is our id, not their language.
	const bayNumberById = new Map(
		[...design.bays]
			.sort((a, b) => a.order - b.order)
			.map((bay, i) => [bay.id, i + 1]),
	);
	const bayLabel = (bayId: string) => `bay ${bayNumberById.get(bayId) ?? "?"}`;

	const finishSurcharges: PriceLineItem[] = design.doors.map((door) => {
		const bayWidthMm = bayWidthById.get(door.bayId) ?? 0;
		const bayFt = mmToFt(bayWidthMm);
		const finish = finishes[door.finish];
		if (!finish) throw new Error(`unknown finish "${door.finish}"`);
		return {
			label: `${finish.label} (${bayLabel(door.bayId)})`,
			amountRm: finish.surchargeRmPerFt * bayFt,
		};
	});

	const doorTypeSurcharges: PriceLineItem[] = design.doors.map((door) => {
		const bayWidthMm = bayWidthById.get(door.bayId) ?? 0;
		const bayFt = mmToFt(bayWidthMm);
		const doorType = doorTypes[door.type];
		if (!doorType) throw new Error(`unknown door type "${door.type}"`);
		return {
			label: `${doorType.label} door (${bayLabel(door.bayId)})`,
			amountRm: doorType.surchargeRmPerFt * bayFt,
		};
	});

	const accessories: PriceLineItem[] = design.interiors.flatMap((interior) =>
		interior.accessories.map((accessoryId) => {
			const accessory = accessoryRates[accessoryId];
			if (!accessory) throw new Error(`unknown accessory "${accessoryId}"`);
			return {
				label: `${accessory.label} (${bayLabel(interior.bayId)})`,
				amountRm: accessory.rateRm,
			};
		}),
	);

	const totalRm =
		base.amountRm +
		sum(finishSurcharges) +
		sum(doorTypeSurcharges) +
		sum(accessories);

	return {
		runFt,
		base,
		finishSurcharges,
		doorTypeSurcharges,
		accessories,
		totalRm,
	};
}

function sum(items: PriceLineItem[]): number {
	return items.reduce((total, item) => total + item.amountRm, 0);
}
