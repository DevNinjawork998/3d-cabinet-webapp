import { describe, expect, it } from "vitest";
import {
	fitToRoom,
	resizeBay,
	resizeOpening,
	setAllDoors,
	setBayCount,
	setDoor,
	setInterior,
	toggleAccessory,
} from "../edits";
import { buildDesign } from "../presets";
import { validateDesign } from "../rules";
import type { DesignDocument } from "../schema";

const design = (): DesignDocument =>
	buildDesign({
		widthMm: 2400,
		heightMm: 2400,
		finish: "laminate-oak",
		doorType: "hinged",
	});

const widths = (d: DesignDocument) => d.bays.map((bay) => bay.width);
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** Every edit must leave a document the rest of the engine accepts. */
const expectValid = (d: DesignDocument) => {
	const result = validateDesign(d);
	expect(result.issues).toEqual([]);
	expect(result.valid).toBe(true);
};

describe("resizeOpening", () => {
	it("re-splits the bays and keeps them summing to the opening", () => {
		const next = resizeOpening(design(), { widthMm: 3600 });
		expect(next.opening.width).toBe(3600);
		expect(sum(widths(next))).toBeCloseTo(3600, 6);
		expectValid(next);
	});

	it("carries a fitted-out bay across a resize", () => {
		const base = setInterior(design(), "bay-1", [
			{ kind: "shelf", heightFromFloor: 900 },
			{ kind: "drawer", heightFromFloor: 60, count: 3 },
		]);
		const next = resizeOpening(base, { widthMm: 3600 });

		const first = next.interiors.find((i) => i.bayId === next.bays[0].id);
		expect(first?.items).toEqual([
			{ kind: "shelf", heightFromFloor: 900 },
			{ kind: "drawer", heightFromFloor: 60, count: 3 },
		]);
		// Every new bay has an interior and a door, not just the carried ones.
		expect(next.interiors).toHaveLength(next.bays.length);
		expect(next.doors).toHaveLength(next.bays.length);
	});

	it("keeps per-bay door choices across a resize", () => {
		const base = setDoor(design(), "bay-2", {
			finish: "veneer-teak",
			handle: "knob",
		});
		const next = resizeOpening(base, { widthMm: 2600 });
		const second = next.doors.find((d) => d.bayId === next.bays[1].id);
		expect(second?.finish).toBe("veneer-teak");
		expect(second?.handle).toBe("knob");
	});

	it("keeps the bay count when only the height changes", () => {
		const before = design();
		const next = resizeOpening(before, { heightMm: 2100 });
		expect(next.opening.height).toBe(2100);
		expect(widths(next)).toEqual(widths(before));
		expectValid(next);
	});

	it("re-seats top-anchored items when the carcass gets shorter", () => {
		const before = design();
		const topShelf = before.interiors[0].items.find(
			(item) => item.kind === "shelf",
		);
		const next = resizeOpening(before, { heightMm: 2000 });

		const shelf = next.interiors[0].items.find((item) => item.kind === "shelf");
		// It sat 550mm below the top and it still does.
		expect((topShelf?.heightFromFloor ?? 0) - 2400).toBeCloseTo(
			(shelf?.heightFromFloor ?? 0) - 2000,
			6,
		);
		for (const item of next.interiors[0].items) {
			expect(item.heightFromFloor).toBeGreaterThanOrEqual(0);
			expect(item.heightFromFloor).toBeLessThan(2000);
		}
	});

	it("leaves floor-anchored drawers on the floor", () => {
		const base = setInterior(design(), "bay-1", [
			{ kind: "drawer", heightFromFloor: 60, count: 2 },
		]);
		const next = resizeOpening(base, { heightMm: 2000 });
		expect(next.interiors[0].items[0].heightFromFloor).toBe(60);
	});
});

describe("setBayCount", () => {
	it("splits the same opening into equal bays", () => {
		const next = setBayCount(design(), 4);
		expect(next.bays).toHaveLength(4);
		expect(widths(next)).toEqual([600, 600, 600, 600]);
		expectValid(next);
	});

	it("refuses counts that would break the bay width limits", () => {
		// 2400 across 8 bays is 300 each — the minimum, so still legal.
		expect(setBayCount(design(), 8).bays).toHaveLength(8);
		// 9 would be 266mm, below the minimum, so the count is clamped.
		const tooMany = setBayCount(design(), 9);
		expect(tooMany.bays.length).toBeLessThanOrEqual(8);
		expectValid(tooMany);

		// One 2400mm bay is over the maximum, so it cannot go below two.
		const tooFew = setBayCount(design(), 1);
		expect(tooFew.bays.length).toBeGreaterThanOrEqual(2);
		expectValid(tooFew);
	});

	it("carries fit-out into the new bays by order", () => {
		const base = setDoor(design(), "bay-1", { finish: "veneer-walnut" });
		const next = setBayCount(base, 3);
		expect(next.doors[0].finish).toBe("veneer-walnut");
		expect(next.doors).toHaveLength(3);
	});
});

describe("resizeBay", () => {
	// 1800 across two bays leaves slack to move; a 2400 opening packs into two
	// 1200 bays with nothing to give either way.
	const roomy = () =>
		buildDesign({
			widthMm: 1800,
			heightMm: 2400,
			finish: "laminate-oak",
			doorType: "hinged",
		});

	it("takes the difference from the next bay", () => {
		const next = resizeBay(roomy(), "bay-1", 700);
		expect(widths(next)).toEqual([700, 1100]);
		expect(sum(widths(next))).toBe(1800);
		expectValid(next);
	});

	it("takes from the previous bay for the last one", () => {
		const three = setBayCount(roomy(), 3);
		const next = resizeBay(three, three.bays[2].id, 700);
		expect(next.bays[2].width).toBe(700);
		expect(sum(widths(next))).toBeCloseTo(1800, 6);
		expectValid(next);
	});

	it("will not push itself or a neighbour outside the catalogue limits", () => {
		const next = resizeBay(roomy(), "bay-1", 5000);
		expect(next.bays[0].width).toBeLessThanOrEqual(1200);
		expect(next.bays[1].width).toBeGreaterThanOrEqual(300);
		expectValid(next);

		// A fully packed run has no slack at all, so nothing moves.
		const packed = design();
		expect(widths(resizeBay(packed, "bay-1", 600))).toEqual(widths(packed));
	});

	it("does nothing to a single-bay run", () => {
		const one = { ...design(), bays: [{ id: "bay-1", width: 900, order: 0 }] };
		expect(resizeBay(one, "bay-1", 1200).bays[0].width).toBe(900);
	});
});

describe("setInterior and toggleAccessory", () => {
	it("replaces one bay's items and leaves the others alone", () => {
		const before = design();
		const next = setInterior(before, "bay-2", [
			{ kind: "rail", heightFromFloor: 1200 },
		]);
		expect(next.interiors[1].items).toEqual([
			{ kind: "rail", heightFromFloor: 1200 },
		]);
		expect(next.interiors[0].items).toEqual(before.interiors[0].items);
	});

	it("toggles an accessory on and back off", () => {
		const on = toggleAccessory(design(), "bay-1", "led-strip");
		expect(on.interiors[0].accessories).toContain("led-strip");
		const off = toggleAccessory(on, "bay-1", "led-strip");
		expect(off.interiors[0].accessories).not.toContain("led-strip");
	});
});

describe("setDoor and setAllDoors", () => {
	it("changes one bay's door only", () => {
		const next = setDoor(design(), "bay-2", { type: "sliding" });
		expect(next.doors[1].type).toBe("sliding");
		expect(next.doors[0].type).toBe("hinged");
	});

	it("changes every door at once", () => {
		const next = setAllDoors(design(), { finish: "veneer-blackwood" });
		for (const door of next.doors) expect(door.finish).toBe("veneer-blackwood");
	});
});

describe("immutability", () => {
	it("never mutates the document it is given", () => {
		const before = design();
		const snapshot = JSON.stringify(before);
		resizeOpening(before, { widthMm: 3000 });
		setBayCount(before, 4);
		resizeBay(before, "bay-1", 700);
		setInterior(before, "bay-1", []);
		toggleAccessory(before, "bay-1", "led-strip");
		setDoor(before, "bay-1", { handle: "knob" });
		setAllDoors(before, { type: "sliding" });
		expect(JSON.stringify(before)).toBe(snapshot);
	});
});

describe("fitToRoom", () => {
	const room = { widthMm: 4400, depthMm: 3200, heightMm: 2700 };

	it("leaves a design that already fits alone", () => {
		const before = resizeOpening(design(), { ceilingHeightMm: 2700 });
		expect(fitToRoom(before, room)).toBe(before);
	});

	it("shrinks a run that no longer fits the longest wall", () => {
		const wide = resizeOpening(design(), { widthMm: 4400 });
		const next = fitToRoom(wide, { ...room, widthMm: 2000, depthMm: 2000 });
		expect(next.opening.width).toBe(2000);
		expectValid(next);
	});

	it("shortens a unit that no longer fits under the ceiling", () => {
		const next = fitToRoom(design(), { ...room, heightMm: 2300 });
		expect(next.opening.height).toBeLessThanOrEqual(2250);
		expect(next.opening.ceilingHeight).toBe(2300);
		expectValid(next);
	});
});
