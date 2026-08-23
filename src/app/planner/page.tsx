import { prisma } from "@/lib/catalogue/db";
import { finishSlot, siteImageSrc } from "@/lib/catalogue/siteImages";
import { getPublishedPlannerCatalogue } from "@/lib/catalogue/store";
import { ROOM_TYPES, type RoomTypeId } from "@/lib/planner/catalogue";
import { DEFAULT_FINISH_TEXTURES } from "@/lib/planner/finishTextures";
import { PlannerApp } from "./PlannerApp";

const VALID_ROOM_IDS = new Set<string>(ROOM_TYPES.map((r) => r.id));

export default async function PlannerPage({
	searchParams,
}: {
	searchParams: Promise<{ room?: string }>;
}) {
	const { room } = await searchParams;
	const initialRoomId: RoomTypeId = VALID_ROOM_IDS.has(room ?? "")
		? (room as RoomTypeId)
		: "kitchen";

	const [{ data: catalogue }, siteImages] = await Promise.all([
		getPublishedPlannerCatalogue(),
		prisma.siteImage.findMany(),
	]);

	// The photo an admin uploaded for each finish, if any. The same slot already
	// feeds the landing page's swatch, so one upload makes the strip and the 3D
	// cabinet show the same board — which is the point: a customer picks a
	// swatch and sees that exact decor on the door.
	const uploaded = new Map(
		siteImages.map((image) => [
			image.key,
			siteImageSrc(image.key, image.updatedAt),
		]),
	);
	// Shipped decor scans first, an admin upload over the top. That order is
	// what lets the client fix a wrong board themselves without a deploy.
	const finishTextures: Record<string, string> = {};
	for (const finish of catalogue.finishes) {
		const url =
			uploaded.get(finishSlot(finish.id)) ?? DEFAULT_FINISH_TEXTURES[finish.id];
		if (url) finishTextures[finish.id] = url;
	}

	return (
		<PlannerApp
			initialRoomId={initialRoomId}
			catalogue={catalogue}
			finishTextures={finishTextures}
		/>
	);
}
