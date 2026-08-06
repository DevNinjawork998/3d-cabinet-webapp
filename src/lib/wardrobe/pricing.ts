import { ACCESSORIES, DOOR_TYPES, FINISHES, RATES } from "./catalogue";
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

function mmToFt(mm: number): number {
	return mm / RATES.mmPerFt;
}

export function computePrice(design: DesignDocument): PriceBreakdown {
	const runFt = mmToFt(design.opening.width);
	const base: PriceLineItem = {
		label: `Base (${runFt.toFixed(2)} ft run)`,
		amountRm: RATES.baseRmPerFt * runFt,
	};

	const bayWidthById = new Map(design.bays.map((bay) => [bay.id, bay.width]));

	const finishSurcharges: PriceLineItem[] = design.doors.map((door) => {
		const bayWidthMm = bayWidthById.get(door.bayId) ?? 0;
		const bayFt = mmToFt(bayWidthMm);
		const finish = FINISHES[door.finish];
		return {
			label: `${finish.label} (bay ${door.bayId})`,
			amountRm: finish.surchargeRmPerFt * bayFt,
		};
	});

	const doorTypeSurcharges: PriceLineItem[] = design.doors.map((door) => {
		const bayWidthMm = bayWidthById.get(door.bayId) ?? 0;
		const bayFt = mmToFt(bayWidthMm);
		const doorType = DOOR_TYPES[door.type];
		return {
			label: `${doorType.label} door (bay ${door.bayId})`,
			amountRm: doorType.surchargeRmPerFt * bayFt,
		};
	});

	const accessories: PriceLineItem[] = design.interiors.flatMap((interior) =>
		interior.accessories.map((accessoryId) => {
			const accessory = ACCESSORIES[accessoryId];
			return {
				label: `${accessory.label} (bay ${interior.bayId})`,
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
