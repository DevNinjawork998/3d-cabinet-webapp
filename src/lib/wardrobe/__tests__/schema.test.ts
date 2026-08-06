import { describe, expect, it } from "vitest";
import { designDocumentSchema } from "../schema";
import invalidDesign from "./fixtures/invalid-design.json";
import validDesign from "./fixtures/valid-design.json";

describe("designDocumentSchema", () => {
	it("accepts a valid design", () => {
		const result = designDocumentSchema.safeParse(validDesign);
		expect(result.success).toBe(true);
	});

	it("rejects a design with an unknown door type", () => {
		const result = designDocumentSchema.safeParse(invalidDesign);
		expect(result.success).toBe(false);
	});
});
