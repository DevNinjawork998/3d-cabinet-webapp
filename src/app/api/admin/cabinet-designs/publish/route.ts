import { NextResponse } from "next/server";
import { z } from "zod";
import { publishDesigns } from "@/lib/catalogue/publishDesigns";

export const runtime = "nodejs";

const bodySchema = z.object({
	ids: z.array(z.string()).min(1).max(50),
});

/**
 * Pushes several designs into the catalogue as **one** draft.
 *
 * The client draws one export per width — BC 600, BC 800, BC 900 — and those are
 * three rungs of one size ladder, not three decisions. Pushing them one at a
 * time made three DRAFT versions to review and publish in sequence, each based
 * on the last.
 *
 * A file that will not parse fails on its own row rather than taking the batch
 * with it: each design is its own rung, and losing two good uploads to one bad
 * one is how an admin stops trusting the button.
 */
export async function POST(request: Request) {
	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	const result = await publishDesigns(parsed.data.ids);

	if (!result.ok) {
		return NextResponse.json(
			{
				error: "all_failed",
				message:
					result.failures[0]?.message ?? "None of those designs could be read.",
				failures: result.failures,
			},
			{ status: result.failures[0]?.status ?? 422 },
		);
	}

	return NextResponse.json(result);
}
