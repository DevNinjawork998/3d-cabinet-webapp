import { getPublishedPlannerCatalogue } from "@/lib/catalogue/store";
import { ROOM_TYPES, type RoomTypeId } from "@/lib/planner/catalogue";
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

	const { data: catalogue } = await getPublishedPlannerCatalogue();

	return <PlannerApp initialRoomId={initialRoomId} catalogue={catalogue} />;
}
