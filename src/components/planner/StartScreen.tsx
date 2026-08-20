import Link from "next/link";
import { ROOM_TYPES, type RoomTypeId } from "@/lib/planner/catalogue";
import { starterFor } from "@/lib/planner/layout";
import { computePlannerPrice } from "@/lib/planner/pricing";

/**
 * The two real starting points the engine has for a wall: its shipped
 * preset, or nothing. The redesign this screen is drawn from also offered an
 * "L-shape corner" — the planner is a single-wall run only (see CLAUDE.md),
 * so that option is left out rather than faked.
 */
export type StartPreset = "starter" | "blank";

const ROOM_ICON_PATHS: Record<RoomTypeId, React.ReactNode> = {
	kitchen: (
		<>
			<rect
				x={4}
				y={20}
				width={30}
				height={28}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={4}
				y={4}
				width={30}
				height={12}
				fill="currentColor"
				fillOpacity={0.25}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={40}
				y={10}
				width={56}
				height={38}
				fill="currentColor"
				fillOpacity={0.1}
				stroke="currentColor"
				strokeWidth={1}
			/>
		</>
	),
	living: (
		<>
			<rect
				x={4}
				y={24}
				width={46}
				height={24}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={56}
				y={6}
				width={40}
				height={42}
				fill="currentColor"
				fillOpacity={0.1}
				stroke="currentColor"
				strokeWidth={1}
			/>
		</>
	),
	bedroom: (
		<>
			<rect
				x={18}
				y={4}
				width={24}
				height={44}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={46}
				y={4}
				width={20}
				height={44}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={70}
				y={4}
				width={20}
				height={44}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
		</>
	),
	foyer: (
		<>
			<rect
				x={10}
				y={4}
				width={26}
				height={34}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={42}
				y={26}
				width={34}
				height={12}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
		</>
	),
};

const ROOM_SUBTITLE: Record<RoomTypeId, string> = {
	kitchen: "Real Infinite Cabinet sizes",
	living: "TV ledge & display units",
	bedroom: "Wardrobes",
	foyer: "Shoe cabinets & bench",
};

export function StartScreen({
	roomId,
	onPickRoom,
	preset,
	onPickPreset,
	onStart,
}: {
	roomId: RoomTypeId;
	onPickRoom: (id: RoomTypeId) => void;
	preset: StartPreset;
	onPickPreset: (preset: StartPreset) => void;
	onStart: () => void;
}) {
	const room = ROOM_TYPES.find((r) => r.id === roomId) ?? ROOM_TYPES[0];
	const starter = starterFor(roomId);
	const starterPrice = computePlannerPrice(starter, "strata-noir");

	return (
		<main className="flex h-screen flex-col bg-[#e9e7e3] text-neutral-900">
			<div className="flex h-14 shrink-0 items-center justify-between gap-6 border-neutral-200 border-b bg-white px-5">
				<Link href="/" className="font-semibold text-sm hover:text-neutral-600">
					Infinite Cabinet · Room planner
				</Link>
				<div className="flex items-center gap-4">
					<span className="text-neutral-500 text-xs">
						Free to try · no account needed
					</span>
					<Link
						href="/admin/login"
						className="border-neutral-200 border-l pl-4 text-[12px] text-neutral-400 hover:text-neutral-600"
					>
						Admin
					</Link>
				</div>
			</div>

			<div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-10">
				<div className="max-w-lg text-center">
					<h1 className="mb-2 font-semibold text-2xl">
						What room are you planning?
					</h1>
					<p className="text-neutral-500 text-sm leading-5">
						Pick one to start from real Infinite Cabinet sizes and a layout
						already on your wall.
					</p>
				</div>

				<div className="grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
					{ROOM_TYPES.map((option) => {
						const active = option.id === roomId;
						return (
							<button
								key={option.id}
								type="button"
								onClick={() => onPickRoom(option.id)}
								className={`rounded-xl border-2 p-4 text-center transition ${
									active
										? "border-neutral-900"
										: "border-neutral-200 hover:border-neutral-400"
								}`}
							>
								<div className="flex h-[72px] items-center justify-center">
									<svg
										viewBox="0 0 100 50"
										className={`h-14 w-full ${active ? "text-neutral-600" : "text-neutral-400"}`}
										role="img"
										aria-label={`${option.label} icon`}
									>
										<title>{`${option.label} icon`}</title>
										{ROOM_ICON_PATHS[option.id]}
									</svg>
								</div>
								<p className="mt-2.5 font-semibold text-sm">{option.label}</p>
								<p className="mt-0.5 text-neutral-500 text-xs">
									{ROOM_SUBTITLE[option.id]}
								</p>
							</button>
						);
					})}
				</div>

				<div className="w-full max-w-3xl">
					<p className="mb-2.5 font-medium text-neutral-600 text-sm">
						Then, a starting layout for a{" "}
						{(room.defaultWallWidthMm / 1000).toFixed(1)} m wall
					</p>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<button
							type="button"
							onClick={() => onPickPreset("starter")}
							className={`overflow-hidden rounded-lg border-2 text-left transition ${
								preset === "starter"
									? "border-neutral-900"
									: "border-neutral-200 hover:border-neutral-400"
							}`}
						>
							<div className="flex h-[100px] items-end gap-0.5 bg-[#f4f2ee] p-2.5">
								{starter.floor.slice(0, 6).map((placed, i) => (
									<span
										key={placed.id}
										className="bg-[#c9c2b5]"
										style={{
											flex: 1,
											height: `${45 + ((i * 13) % 45)}%`,
										}}
									/>
								))}
							</div>
							<div className="px-3 py-2.5">
								<p className="font-medium text-sm">Full run</p>
								<p className="mt-0.5 text-neutral-500 text-xs">
									{starter.floor.length + starter.wall.length} units · from RM{" "}
									{starterPrice.totalRm.toLocaleString("en-MY", {
										maximumFractionDigits: 0,
									})}
								</p>
							</div>
						</button>
						<button
							type="button"
							onClick={() => onPickPreset("blank")}
							className={`overflow-hidden rounded-lg border-2 text-left transition ${
								preset === "blank"
									? "border-neutral-900"
									: "border-neutral-200 hover:border-neutral-400"
							}`}
						>
							<div className="flex h-[100px] items-center justify-center bg-[#f4f2ee]">
								<span className="text-neutral-400 text-xs">Start blank</span>
							</div>
							<div className="px-3 py-2.5">
								<p className="font-medium text-sm">Blank wall</p>
								<p className="mt-0.5 text-neutral-500 text-xs">
									Build it yourself
								</p>
							</div>
						</button>
					</div>
				</div>

				<button
					type="button"
					onClick={onStart}
					className="rounded-lg bg-neutral-900 px-7 py-3 font-medium text-sm text-white transition hover:bg-neutral-800"
				>
					Start planning
				</button>
			</div>
		</main>
	);
}
