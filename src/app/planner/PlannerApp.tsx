"use client";

import { useCallback, useEffect, useState } from "react";
import { QuoteScreen } from "@/components/planner/QuoteScreen";
import {
	type StartPreset,
	StartScreen,
} from "@/components/planner/StartScreen";
import { StudioScreen } from "@/components/planner/StudioScreen";
import type { FinishId, RoomTypeId } from "@/lib/planner/catalogue";
import {
	ROOM_TYPES,
	roomType,
	setActivePlannerCatalogue,
} from "@/lib/planner/catalogue";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";
import {
	emptyLayout,
	type PlannerLayout,
	removeModules,
	starterFor,
} from "@/lib/planner/layout";

type Screen = "start" | "studio" | "quote";

/** Every room starts from its own preset, and keeps its own work. */
const initialRooms = (): Record<RoomTypeId, PlannerLayout> =>
	Object.fromEntries(
		ROOM_TYPES.map((room) => [room.id, starterFor(room.id)]),
	) as Record<RoomTypeId, PlannerLayout>;

export function PlannerApp({
	initialRoomId,
	catalogue,
}: {
	initialRoomId: RoomTypeId;
	/** The live published catalogue — swapped into the module-level palette
	 * before anything below reads it. See `setActivePlannerCatalogue`. */
	catalogue: PlannerCatalogue;
}) {
	setActivePlannerCatalogue(catalogue);

	const [screen, setScreen] = useState<Screen>("start");
	const [roomId, setRoomId] = useState<RoomTypeId>(initialRoomId);
	const [preset, setPreset] = useState<StartPreset>("starter");
	// One layout per room, so switching to the foyer and back does not throw
	// away the kitchen the customer just arranged.
	const [rooms, setRooms] =
		useState<Record<RoomTypeId, PlannerLayout>>(initialRooms);
	// Defaults to whatever the catalogue lists first — hardcoding an id here
	// would render an unstyled room for any catalogue that drops it.
	const [finish, setFinish] = useState<FinishId>(catalogue.finishes[0].id);
	const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);

	const layout = rooms[roomId];
	const setLayout = useCallback(
		(next: PlannerLayout | ((prev: PlannerLayout) => PlannerLayout)) =>
			setRooms((prev) => ({
				...prev,
				[roomId]:
					typeof next === "function"
						? (next as (p: PlannerLayout) => PlannerLayout)(prev[roomId])
						: next,
			})),
		[roomId],
	);

	const removeSelected = useCallback(() => {
		setLayout((prev) => removeModules(prev, selectedIds));
		setSelectedIds([]);
	}, [selectedIds, setLayout]);

	useEffect(() => {
		if (screen !== "studio") return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Delete" && e.key !== "Backspace") return;
			const target = e.target as HTMLElement | null;
			if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
			if (selectedIds.length === 0) return;
			e.preventDefault();
			removeSelected();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [screen, selectedIds, removeSelected]);

	if (screen === "start") {
		return (
			<StartScreen
				roomId={roomId}
				onPickRoom={setRoomId}
				preset={preset}
				onPickPreset={setPreset}
				onStart={() => {
					if (preset === "blank") {
						setRooms((prev) => ({
							...prev,
							[roomId]: emptyLayout(roomType(roomId).defaultWallWidthMm),
						}));
					}
					setSelectedIds([]);
					setScreen("studio");
				}}
			/>
		);
	}

	if (screen === "quote") {
		return (
			<QuoteScreen
				roomId={roomId}
				layout={layout}
				finish={finish}
				onBackToStudioAction={() => setScreen("studio")}
			/>
		);
	}

	return (
		<StudioScreen
			roomId={roomId}
			onChangeRoomAction={(id) => {
				setRoomId(id);
				setSelectedIds([]);
			}}
			layout={layout}
			setLayoutAction={setLayout}
			finish={finish}
			setFinishAction={setFinish}
			selectedIds={selectedIds}
			setSelectedIdsAction={setSelectedIds}
			onGoToQuoteAction={() => setScreen("quote")}
			onBackToStartAction={() => setScreen("start")}
		/>
	);
}
