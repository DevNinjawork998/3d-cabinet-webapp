import { describe, expect, it } from "vitest";
import { hingeSideFromName } from "../roles";

/**
 * The drafter's own naming is the best signal in the file about which stile a
 * door hangs on, and until now it was thrown away: `NAMING_RULES` matches a
 * bare `\bdoor\b`, so `Door_L_` and `Door_R_` classified identically and the
 * side was gone by the time anything drew the cabinet.
 */
describe("hingeSideFromName", () => {
	it("reads the client's own underscore convention", () => {
		// Underscores are word separators to a drafter and word *characters* to a
		// regex, which is why this cannot be a bare `\bl\b` against the raw name.
		expect(hingeSideFromName("Door_L_1")).toBe("left");
		expect(hingeSideFromName("Door_R_2")).toBe("right");
	});

	it("reads the parenthesised convention", () => {
		expect(hingeSideFromName("G-Door(L)")).toBe("left");
		expect(hingeSideFromName("G-Door(R)")).toBe("right");
	});

	it("reads a spelled-out side", () => {
		expect(hingeSideFromName("Left Door")).toBe("left");
		expect(hingeSideFromName("door right")).toBe("right");
	});

	it("is null for a door the drafter did not hand", () => {
		expect(hingeSideFromName("G-Door")).toBeNull();
		expect(hingeSideFromName("Door_1")).toBeNull();
	});

	it("is null for anything that is not a door", () => {
		// An end panel named `G-UEnd_(R)` carries an R, and it is not a hinge.
		expect(hingeSideFromName("G-UEnd_(R)")).toBeNull();
		expect(hingeSideFromName("Drw_Front_L")).toBeNull();
		expect(hingeSideFromName("Shelf_L")).toBeNull();
	});
});
