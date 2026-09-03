import { describe, expect, it } from "vitest";
import {
	LOAD_FACTOR,
	longestEdgeMm,
	suggestVehicle,
	totalVolumeM3,
	totalWeightKg,
	VEHICLE_LIMITS,
} from "../measure";
import type { DeliveryItem } from "../types";

/** A 600×720×560 base carcass — the size the catalogue leans on. */
const carcass = (over: Partial<DeliveryItem> = {}): DeliveryItem => ({
	label: "Base cabinet 600",
	qty: 1,
	widthMm: 600,
	heightMm: 720,
	depthMm: 560,
	weightKg: null,
	...over,
});

describe("totalVolumeM3", () => {
	it("is zero for no items", () => {
		expect(totalVolumeM3([])).toBe(0);
	});

	it("sums one carcass to its litres", () => {
		// 600 * 720 * 560 = 241,920,000 mm³ = 0.24192 m³, rounded to litres.
		expect(totalVolumeM3([carcass()])).toBe(0.242);
	});

	it("multiplies by quantity", () => {
		expect(totalVolumeM3([carcass({ qty: 4 })])).toBe(0.968);
	});
});

describe("totalWeightKg", () => {
	it("is null when nothing is weighed, so unknown never reads as zero", () => {
		expect(totalWeightKg([carcass(), carcass()])).toBeNull();
	});

	it("sums only the items that carry a weight", () => {
		expect(
			totalWeightKg([carcass({ weightKg: 32.5, qty: 2 }), carcass()]),
		).toBe(65);
	});
});

describe("longestEdgeMm", () => {
	it("is the largest single dimension across every item", () => {
		expect(
			longestEdgeMm([carcass(), carcass({ heightMm: 2100, label: "Tall" })]),
		).toBe(2100);
	});
});

describe("suggestVehicle", () => {
	it("says nothing for an empty job", () => {
		expect(suggestVehicle([]).id).toBeNull();
	});

	it("picks the smallest class that fits", () => {
		expect(suggestVehicle([carcass()]).id).toBe("car");
	});

	it("steps up when volume crosses the load factor, not the raw capacity", () => {
		const car = VEHICLE_LIMITS[0];
		// One item just over the car's usable volume, kept inside its edge limit.
		const usableLitres = car.maxVolumeM3 * LOAD_FACTOR * 1000;
		const side = Math.cbrt((usableLitres + 20) * 1e6);
		const cube = carcass({
			widthMm: Math.round(side),
			heightMm: Math.round(side),
			depthMm: Math.round(side),
		});

		expect(totalVolumeM3([cube])).toBeGreaterThan(
			car.maxVolumeM3 * LOAD_FACTOR,
		);
		expect(totalVolumeM3([cube])).toBeLessThan(car.maxVolumeM3);
		expect(suggestVehicle([cube]).id).toBe("van");
	});

	it("steps up on longest edge alone, whatever the volume", () => {
		// A tall panel is small in volume but will not go in a car.
		const panel = carcass({ widthMm: 2200, heightMm: 60, depthMm: 600 });
		expect(totalVolumeM3([panel])).toBeLessThan(0.5);
		expect(suggestVehicle([panel]).id).toBe("lorry_1t");
	});

	it("steps up on weight alone", () => {
		expect(suggestVehicle([carcass({ weightKg: 200 })]).id).toBe("van");
	});

	it("refuses to suggest one vehicle when the job exceeds the largest", () => {
		const suggestion = suggestVehicle([carcass({ qty: 200 })]);
		expect(suggestion.id).toBeNull();
		expect(suggestion.reason).toContain("split");
	});
});
