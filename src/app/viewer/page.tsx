"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { StepBays } from "@/components/configurator/StepBays";
import { StepDoors } from "@/components/configurator/StepDoors";
import { StepFitOut } from "@/components/configurator/StepFitOut";
import { StepMeasure } from "@/components/configurator/StepMeasure";
import { StepPrice } from "@/components/configurator/StepPrice";
import { type StepIndex, Stepper } from "@/components/configurator/Stepper";
import { fitToRoom } from "@/lib/wardrobe/edits";
import {
	backWallPlacement,
	clampPlacement,
	type Placement,
} from "@/lib/wardrobe/placement";
import { buildDesign, DEFAULT_DEPTH_MM } from "@/lib/wardrobe/presets";
import { computePrice } from "@/lib/wardrobe/pricing";
import { DEFAULT_ROOM, type RoomSize } from "@/lib/wardrobe/room";
import { validateDesign } from "@/lib/wardrobe/rules";
import {
	type DesignDocument,
	designDocumentSchema,
} from "@/lib/wardrobe/schema";

const Scene = dynamic(() => import("@/components/viewer/Scene"), {
	ssr: false,
	loading: () => (
		<div className="flex h-full items-center justify-center text-sm text-neutral-500">
			Loading 3D view…
		</div>
	),
});

const STORAGE_KEY = "wardrobe-design-v1";

const initialDesign = () =>
	buildDesign(
		{
			widthMm: 2400,
			heightMm: 2400,
			finish: "laminate-oak",
			doorType: "hinged",
		},
		DEFAULT_ROOM.heightMm,
	);

type Saved = {
	design: DesignDocument;
	room: RoomSize;
	placement: Placement | null;
};

/**
 * Restores the last design from this browser. `schemaVersion` and Zod do the
 * deciding: anything that no longer parses is dropped rather than half-loaded,
 * because a wrong-looking wardrobe on return is worse than a fresh one.
 */
function restore(): Saved | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		const design = designDocumentSchema.safeParse(parsed.design);
		if (!design.success) return null;
		return {
			design: design.data,
			room: parsed.room,
			placement: parsed.placement,
		};
	} catch {
		return null;
	}
}

export default function ViewerPage() {
	const [design, setDesign] = useState<DesignDocument>(initialDesign);
	const [room, setRoom] = useState<RoomSize>(DEFAULT_ROOM);
	const [step, setStep] = useState<StepIndex>(0);
	const [doorsVisible, setDoorsVisible] = useState(true);
	const [selectedBayId, setSelectedBayId] = useState("bay-1");
	const [perBayDoors, setPerBayDoors] = useState(false);
	// null = never moved, so it tracks the back wall as the room is resized.
	const [rawPlacement, setPlacement] = useState<Placement | null>(null);
	const [restored, setRestored] = useState(false);

	// localStorage is not there during SSR, so the restore happens after mount.
	useEffect(() => {
		const saved = restore();
		if (saved) {
			setDesign(saved.design);
			setRoom(saved.room);
			setPlacement(saved.placement);
		}
		setRestored(true);
	}, []);

	useEffect(() => {
		if (!restored) return;
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ design, room, placement: rawPlacement }),
		);
	}, [design, room, rawPlacement, restored]);

	// The interior is what the fit-out step is about, so the doors get out of
	// the way — and come back when the customer moves on.
	useEffect(() => {
		setDoorsVisible(step !== 2);
	}, [step]);

	const validation = useMemo(() => validateDesign(design), [design]);
	const price = useMemo(() => computePrice(design), [design]);

	const updateRoom = (patch: Partial<RoomSize>) => {
		const next = { ...room, ...patch };
		setRoom(next);
		setDesign(fitToRoom(design, next));
	};

	// Derived, not stored: shrinking the room re-seats the unit, and growing it
	// back restores where the customer actually put it.
	const placement = clampPlacement(
		rawPlacement ?? backWallPlacement(room, DEFAULT_DEPTH_MM),
		room,
		design.opening.width,
		design.opening.depth,
	);

	const stepProps = { design, room, onDesign: setDesign, onRoom: updateRoom };

	return (
		<main className="flex h-screen flex-col bg-neutral-100 text-neutral-900 lg:flex-row">
			{/* min-w-0/min-h-0: without them the canvas sizes its own flex parent
			    and the two grow off each other every frame. */}
			<section className="relative h-[55vh] w-full min-w-0 overflow-hidden lg:h-screen lg:flex-1">
				<Scene
					design={design}
					room={room}
					placement={placement}
					doorsVisible={doorsVisible}
					showDimensions={step === 0}
					onRoomChangeAction={updateRoom}
					onPlacementChangeAction={setPlacement}
				/>

				<div className="absolute top-4 left-4 rounded-lg bg-white/90 p-3 shadow-sm backdrop-blur">
					<p className="text-neutral-500 text-xs">Indicative price</p>
					<p className="font-semibold text-xl">RM {price.totalRm.toFixed(2)}</p>
				</div>

				<div className="absolute bottom-4 left-4 flex gap-2">
					<button
						type="button"
						className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow"
						onClick={() => setDoorsVisible((visible) => !visible)}
					>
						{doorsVisible ? "Hide doors" : "Show doors"}
					</button>
					{rawPlacement && (
						<button
							type="button"
							className="rounded-full bg-white px-4 py-2 text-neutral-900 text-sm shadow"
							onClick={() => setPlacement(null)}
						>
							Reset placement
						</button>
					)}
				</div>

				<p className="-translate-x-1/2 absolute bottom-4 left-1/2 hidden text-neutral-500 text-xs lg:block">
					Drag the wardrobe to move it — use the dot in front to turn it
				</p>
			</section>

			<aside className="flex w-full shrink-0 flex-col border-neutral-200 border-t bg-white p-5 lg:h-full lg:w-96 lg:border-t-0 lg:border-l">
				<Stepper step={step} onStep={setStep} issues={validation.issues}>
					{step === 0 && <StepMeasure {...stepProps} />}
					{step === 1 && <StepBays {...stepProps} />}
					{step === 2 && (
						<StepFitOut
							{...stepProps}
							selectedBayId={selectedBayId}
							onSelectBay={setSelectedBayId}
						/>
					)}
					{step === 3 && (
						<StepDoors
							{...stepProps}
							selectedBayId={selectedBayId}
							onSelectBay={setSelectedBayId}
							perBay={perBayDoors}
							onPerBay={setPerBayDoors}
						/>
					)}
					{step === 4 && <StepPrice {...stepProps} />}
				</Stepper>
			</aside>
		</main>
	);
}
