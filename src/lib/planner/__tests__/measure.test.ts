import { describe, expect, it } from "vitest";
import { addModule, allPositions, emptyLayout } from "../layout";
import {
	cabinetBoundsMm,
	cabinetCornersMm,
	distanceMm,
	measure,
	snapToCabinet,
} from "../measure";

const WALL_MM = 4000;

describe("measure", () => {
	it("derives W/D/H from a cabinet's own two opposite corners", () => {
		const layout = addModule(emptyLayout(WALL_MM), "base-cabinet", 0);
		const [position] = allPositions(layout);
		const bounds = cabinetBoundsMm(position, layout);
		const corners = cabinetCornersMm(position, layout);

		const result = measure(corners[0], corners[7]);

		expect(result.widthMm).toBeCloseTo(bounds.maxX - bounds.minX);
		expect(result.heightMm).toBeCloseTo(bounds.maxY - bounds.minY);
		expect(result.depthMm).toBeCloseTo(bounds.maxZ - bounds.minZ);
		expect(result.distanceMm).toBeCloseTo(distanceMm(corners[0], corners[7]));
	});

	it("snaps a near-corner hit to the exact vertex", () => {
		const layout = addModule(emptyLayout(WALL_MM), "base-cabinet", 0);
		const [position] = allPositions(layout);
		const [corner] = cabinetCornersMm(position, layout);

		const nearHit = { x: corner.x + 5, y: corner.y - 3, z: corner.z + 2 };
		const snapped = snapToCabinet(nearHit, position, layout);

		expect(snapped).toEqual(corner);
	});

	it("leaves a hit unsnapped once it's outside the tolerance", () => {
		const layout = addModule(emptyLayout(WALL_MM), "base-cabinet", 0);
		const [position] = allPositions(layout);
		const [corner] = cabinetCornersMm(position, layout);

		const farHit = { x: corner.x + 500, y: corner.y, z: corner.z };
		const snapped = snapToCabinet(farHit, position, layout);

		expect(snapped).toEqual(farHit);
	});
});
