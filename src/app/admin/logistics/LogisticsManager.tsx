"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { chipClass, fieldClass } from "@/components/admin/styles";
import { LABEL } from "@/lib/logistics/carriers";
import {
	COORDS_HINT,
	type PinState,
	parseCoords,
	pinState,
} from "@/lib/logistics/coords";
import {
	suggestVehicle,
	totalVolumeM3,
	totalWeightKg,
} from "@/lib/logistics/measure";
import type { DeliveryStatusName } from "@/lib/logistics/types";
import { messageFor } from "./errors";
import {
	blankForm,
	type DeliveryEventRow,
	type DeliveryRow,
	EDITABLE,
	emptyItem,
	type FormItem,
	type FormState,
	formFrom,
	NO_PIN_PLACEHOLDER,
	type QuoteRow,
	toPayload,
} from "./form";
import {
	defaultChoice,
	JOURNEY,
	journeySteps,
	quoteTags,
	STATUS_LABEL,
} from "./tracking";

export type { DeliveryEventRow, DeliveryRow, QuoteRow } from "./form";

/**
 * The whole delivery screen: the list, the job form, and the detail panel where
 * partners are compared, one is booked, and the job is then followed.
 *
 * Client-side like the other admin screens — fetch on mount into state, mutate
 * through `/api/admin/deliveries`, then reload. Nothing here is public, so none
 * of it needs to be server-rendered.
 */

const BADGE_TONE: Record<DeliveryStatusName, string> = {
	DRAFT: "bg-neutral-100 text-neutral-500",
	QUOTED: "bg-[#f2efe6] text-[#6b5f2e]",
	BOOKED: "bg-[#e8eef5] text-[#27496b]",
	DRIVER_ASSIGNED: "bg-[#e8eef5] text-[#27496b]",
	PICKED_UP: "bg-[#e8eef5] text-[#27496b]",
	IN_TRANSIT: "bg-[#e8eef5] text-[#27496b]",
	DELIVERED: "bg-[#e7f0ea] text-[#1f5138]",
	CANCELLED: "bg-neutral-100 text-neutral-500",
	FAILED: "bg-red-50 text-red-700",
};

const STOPPED_TONE: Partial<Record<DeliveryStatusName, string>> = {
	CANCELLED: "border-neutral-200 bg-neutral-50 text-neutral-600",
	FAILED: "border-red-200 bg-red-50 text-red-700",
};

const ACTIVE: DeliveryStatusName[] = [
	"BOOKED",
	"DRIVER_ASSIGNED",
	"PICKED_UP",
	"IN_TRANSIT",
];

/**
 * How often the open detail panel re-reads the job.
 *
 * This polls our own database, not the carrier — the cron sweep and the
 * carrier's webhooks are what actually fetch new positions. Calling a partner's
 * API every four seconds per open browser tab would be someone else's rate
 * limit and our bill. "Refresh from carrier" is the button that does that, once.
 */
const POLL_MS = 4000;

export function LogisticsManager({
	initial,
	workshopAddress,
	geocodingConfigured,
	easyparcel,
}: {
	initial: DeliveryRow[];
	workshopAddress: string;
	geocodingConfigured: boolean;
	easyparcel: { appConfigured: boolean; connected: boolean };
}) {
	const router = useRouter();
	const [rows, setRows] = useState<DeliveryRow[]>(initial);
	const [openId, setOpenId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Read after mount, not during render: the OAuth callback's redirect is the
	// only source of this, and `location.search` doesn't exist on the server.
	const [easyparcelResult, setEasyparcelResult] = useState<string | null>(null);
	useEffect(() => {
		setEasyparcelResult(
			new URLSearchParams(window.location.search).get("easyparcel"),
		);
	}, []);

	const load = useCallback(async () => {
		const res = await fetch("/api/admin/deliveries");
		if (res.status === 401) {
			router.push("/admin/login");
			return;
		}
		if (!res.ok) {
			setError("Could not load deliveries");
			return;
		}
		const body = await res.json();
		setRows(body.deliveries ?? []);
	}, [router]);

	async function save(state: FormState) {
		setError(null);
		const res = await fetch(
			state.id === null
				? "/api/admin/deliveries"
				: `/api/admin/deliveries/${state.id}`,
			{
				method: state.id === null ? "POST" : "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(toPayload(state)),
			},
		);
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			setError(messageFor(body?.error, "Could not save this delivery"));
			return;
		}
		setForm(null);
		// Close the panel before reloading, even if the row was already open:
		// `setOpenId` to the id it already holds is a no-op re-render, so
		// `DeliveryDetail` never remounts and keeps showing the pre-edit pin
		// warning. Splitting the close and the reopen across this `await` forces
		// two state batches, so the id change on the far side actually remounts it.
		setOpenId(null);
		await load();
		const body = await res.json().catch(() => null);
		if (body?.delivery?.id) setOpenId(body.delivery.id);
	}

	async function remove(row: DeliveryRow) {
		if (!confirm(`Delete delivery ${row.number} for ${row.customerName}?`))
			return;
		const res = await fetch(`/api/admin/deliveries/${row.id}`, {
			method: "DELETE",
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			setError(messageFor(body?.error, "Could not delete this delivery"));
			return;
		}
		if (openId === row.id) setOpenId(null);
		await load();
	}

	return (
		<div className="flex flex-col gap-6">
			{error && (
				<p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
					{error}
				</p>
			)}

			{!geocodingConfigured && (
				<p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
					Addresses are not looked up here, so every job needs a pin pasted into
					the Site pin field. Vehicle partners price by coordinate and cannot
					quote without one.
				</p>
			)}

			{!easyparcel.appConfigured && (
				<p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
					EasyParcel is not set up on this deployment.
				</p>
			)}

			{easyparcel.appConfigured && !easyparcel.connected && (
				<p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
					EasyParcel is not connected — parcel jobs cannot be quoted.{" "}
					<a
						href="/api/admin/logistics/easyparcel/connect"
						className="font-semibold underline"
					>
						Connect EasyParcel account
					</a>
				</p>
			)}

			{easyparcelResult === "connected" && (
				<p className="rounded-lg bg-[#e7f0ea] px-3 py-2 text-[13px] text-[#1f5138]">
					EasyParcel account connected.
				</p>
			)}

			{easyparcelResult === "failed" && (
				<p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
					Connecting the EasyParcel account failed — try again.
				</p>
			)}

			<div className="flex items-center justify-between">
				<p className="text-[13px] text-neutral-500">
					{rows.length} {rows.length === 1 ? "delivery" : "deliveries"}
				</p>
				<button
					type="button"
					className={chipClass(form !== null)}
					onClick={() =>
						setForm(form === null ? blankForm(workshopAddress) : null)
					}
				>
					{form === null ? "New delivery" : "Cancel"}
				</button>
			</div>

			{form !== null && (
				<DeliveryForm
					state={form}
					onChange={setForm}
					onSubmit={() => save(form)}
					geocodingConfigured={geocodingConfigured}
				/>
			)}

			{rows.length === 0 ? (
				<p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-[13px] text-neutral-500">
					No deliveries yet. Create one to compare logistics partners.
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{rows.map((row) => (
						<li
							key={row.id}
							className="rounded-xl border border-neutral-200 bg-white"
						>
							<div className="flex flex-wrap items-center gap-3 px-4 py-3">
								<span className="font-medium text-[13px] text-neutral-400 tabular-nums">
									#{row.number}
								</span>
								<div className="min-w-[160px] flex-1">
									<p className="font-medium text-[14px]">{row.customerName}</p>
									<p className="truncate text-[12px] text-neutral-500">
										{row.siteAddress}
									</p>
								</div>
								<span className="text-[12px] text-neutral-500">
									{row.carrierId ? LABEL[row.carrierId] : "No partner yet"}
								</span>
								<span
									className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${BADGE_TONE[row.status]}`}
								>
									{STATUS_LABEL[row.status]}
								</span>
								{!row.carrierOrderId &&
									(pinState(row.siteLat, geocodingConfigured) !== "located" ||
										pinState(row.pickupLat, geocodingConfigured) !==
											"located") && (
										<span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-[11px] text-amber-800">
											No map pin
										</span>
									)}
								<button
									type="button"
									className={chipClass(openId === row.id)}
									onClick={() => setOpenId(openId === row.id ? null : row.id)}
								>
									{openId === row.id ? "Close" : "Open"}
								</button>
								{EDITABLE.has(row.status) && (
									<button
										type="button"
										className="text-[12px] text-neutral-400 underline"
										onClick={() => {
											setForm(formFrom(row));
											window.scrollTo({ top: 0, behavior: "smooth" });
										}}
									>
										Edit
									</button>
								)}
								{!row.carrierOrderId && (
									<button
										type="button"
										className="text-[12px] text-neutral-400 underline"
										onClick={() => remove(row)}
									>
										Delete
									</button>
								)}
							</div>
							{openId === row.id && (
								<DeliveryDetail
									id={row.id}
									onChanged={load}
									onError={setError}
									geocodingConfigured={geocodingConfigured}
								/>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function DeliveryForm({
	state,
	onChange,
	onSubmit,
	geocodingConfigured,
}: {
	state: FormState;
	onChange: (next: FormState) => void;
	onSubmit: () => void;
	geocodingConfigured: boolean;
}) {
	const items = state.items.filter((i) => i.label.trim() !== "");
	const suggestion = suggestVehicle(items);
	const weight = totalWeightKg(items);

	const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
		onChange({ ...state, [key]: value });

	const setItem = (index: number, next: Partial<FormItem>) =>
		onChange({
			...state,
			items: state.items.map((item, i) =>
				i === index ? { ...item, ...next } : item,
			),
		});

	return (
		<form
			className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			{state.id !== null && (
				<p className="text-[13px] text-neutral-500">
					Editing <span className="text-neutral-900">{state.customerName}</span>
					. Saving re-checks the address, so a corrected line gets a fresh map
					pin.
				</p>
			)}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<label className="flex flex-col gap-1 text-[12px] text-neutral-500">
					Customer
					<input
						required
						className={fieldClass(false)}
						value={state.customerName}
						onChange={(e) => set("customerName", e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-[12px] text-neutral-500">
					Phone
					<input
						required
						className={fieldClass(false)}
						value={state.customerPhone}
						onChange={(e) => set("customerPhone", e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-[12px] text-neutral-500 sm:col-span-2">
					Site address
					<input
						required
						className={fieldClass(false)}
						value={state.siteAddress}
						onChange={(e) => set("siteAddress", e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-[12px] text-neutral-500 sm:col-span-2">
					Site pin — where the customer is. Paste “3.1509, 101.5931” or a Google
					Maps link
					<input
						className={fieldClass(false)}
						placeholder={state.sitePinPlaceholder}
						value={state.siteCoords}
						onChange={(e) => set("siteCoords", e.target.value)}
					/>
					{(() => {
						const parsed = parseCoords(state.siteCoords);
						if (!parsed.ok && parsed.reason !== "empty") {
							return (
								<span className="text-[11px] text-amber-700">
									{COORDS_HINT[parsed.reason]}
								</span>
							);
						}
						// Empty is normally fine — the address gets looked up. With
						// lookup off it is the whole ballgame, and a job saved without
						// it comes back unquotable with nothing said at the time.
						const noStoredPin = state.sitePinPlaceholder === NO_PIN_PLACEHOLDER;
						return !geocodingConfigured && noStoredPin ? (
							<span className="text-[11px] text-amber-700">
								Addresses are not looked up here, so without this pin no vehicle
								partner can quote the job.
							</span>
						) : null;
					})()}
				</label>
				<label className="flex flex-col gap-1 text-[12px] text-neutral-500 sm:col-span-2">
					Access notes — gate codes, unit number, who to call
					<input
						className={fieldClass(false)}
						value={state.addressNotes}
						onChange={(e) => set("addressNotes", e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-[12px] text-neutral-500">
					Pickup from
					<input
						required
						className={fieldClass(false)}
						value={state.pickupAddress}
						onChange={(e) => set("pickupAddress", e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-[12px] text-neutral-500">
					Pickup pin — the workshop, filled in for you
					<input
						className={fieldClass(false)}
						placeholder={state.pickupPinPlaceholder}
						value={state.pickupCoords}
						onChange={(e) => set("pickupCoords", e.target.value)}
					/>
					{(() => {
						const parsed = parseCoords(state.pickupCoords);
						return parsed.ok || parsed.reason === "empty" ? null : (
							<span className="text-[11px] text-amber-700">
								{COORDS_HINT[parsed.reason]}
							</span>
						);
					})()}
				</label>
				<label className="flex flex-col gap-1 text-[12px] text-neutral-500">
					Scheduled
					<input
						type="datetime-local"
						className={fieldClass(false)}
						value={state.scheduledAt}
						onChange={(e) => set("scheduledAt", e.target.value)}
					/>
				</label>
			</div>

			<div className="flex flex-col gap-2">
				<p className="font-medium text-[13px]">What is going on the lorry</p>
				{state.items.map((item, i) => (
					<div key={item.uid} className="flex flex-wrap items-end gap-2">
						<label className="flex min-w-[150px] flex-1 flex-col gap-1 text-[11px] text-neutral-500">
							Item
							<input
								className={fieldClass(false)}
								value={item.label}
								onChange={(e) => setItem(i, { label: e.target.value })}
							/>
						</label>
						{(["qty", "widthMm", "heightMm", "depthMm"] as const).map(
							(field) => (
								<label
									key={field}
									className="flex w-[74px] flex-col gap-1 text-[11px] text-neutral-500"
								>
									{field === "qty" ? "Qty" : field.replace("Mm", " mm")}
									<input
										type="number"
										min={1}
										className={fieldClass(false)}
										value={item[field]}
										onChange={(e) =>
											setItem(i, { [field]: Number(e.target.value) })
										}
									/>
								</label>
							),
						)}
						<label className="flex w-[86px] flex-col gap-1 text-[11px] text-neutral-500">
							Weight kg
							<input
								type="number"
								min={0}
								step="0.1"
								placeholder="—"
								className={fieldClass(false)}
								value={item.weightKg ?? ""}
								onChange={(e) =>
									setItem(i, {
										weightKg:
											e.target.value === "" ? null : Number(e.target.value),
									})
								}
							/>
						</label>
						<button
							type="button"
							className="pb-2 text-[12px] text-neutral-400 underline"
							onClick={() =>
								onChange({
									...state,
									items: state.items.filter((_, j) => j !== i),
								})
							}
						>
							Remove
						</button>
					</div>
				))}
				<button
					type="button"
					className={`${chipClass(false)} self-start`}
					onClick={() =>
						onChange({ ...state, items: [...state.items, emptyItem()] })
					}
				>
					Add item
				</button>
			</div>

			<p className="text-[12px] text-neutral-500">
				{totalVolumeM3(items)} m³
				{weight === null ? ", weight not given" : `, ${weight} kg`} —{" "}
				<span className="text-neutral-900">{suggestion.label}</span>. The
				vehicle partners price by distance and do not need a weight. The parcel
				partners price by the kilogram and cannot quote without one.
			</p>

			<button
				type="submit"
				className="self-start rounded-full bg-neutral-900 px-4 py-2 text-[13px] text-white"
			>
				{state.id === null ? "Save delivery" : "Save changes"}
			</button>
		</form>
	);
}

/**
 * Why a stop has no pin, in words an admin can act on.
 *
 * Each carries its own action tail — with the geocoder switched off, fixing
 * the address can never help, since nothing looks it up, so that case offers
 * only pasting a pin. `not-found` keeps both options.
 */
const PIN_TROUBLE: Record<
	Exclude<PinState, "located">,
	{ reason: string; action: string }
> = {
	"geocoder-off": {
		reason:
			"was not looked up — address lookup is switched off on this deployment.",
		action: "Paste a pin above.",
	},
	"not-found": {
		reason:
			"did not resolve to a map location — the address may be too vague to place.",
		action: "Use Edit above to fix the address or paste a pin.",
	},
};

/** A carrier id as a person says it, and a sentence-safe fallback. */
const carrierLabel = (id: string | null | undefined) =>
	id ? (LABEL[id] ?? id) : "the partner";

/** Dates as this screen says them: "Sep 5, 11:04 pm". */
const shortTime = (iso: string) =>
	new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

const Spinner = () => (
	<span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-neutral-300 border-t-[#1f5138]" />
);

/** The three moves this panel asks for, and which one is being made now. */
const PROCESS = ["Get quotations", "Choose partner", "Book pickup"];

function ProcessSteps({ stage }: { stage: number }) {
	return (
		<ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
			{PROCESS.map((label, i) => {
				const done = i < stage;
				const active = i === stage;
				return (
					<li
						key={label}
						className={`flex items-center gap-[7px] rounded-full py-1.5 pr-3 pl-2 text-[12px] ${
							active
								? "border border-[#1f5138] bg-[#f2f7f4] font-semibold text-[#17402c]"
								: done
									? "border border-[#bcd0c3] bg-white font-medium text-[#1f5138]"
									: "border border-neutral-200 bg-white font-medium text-neutral-500"
						}`}
					>
						<span
							className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full font-bold text-[11px] ${
								active
									? "bg-[#1f5138] text-white"
									: done
										? "bg-[#dbe8e0] text-[#1f5138]"
										: "bg-[#f0efec] text-neutral-600"
							}`}
						>
							{done ? "✓" : i + 1}
						</span>
						{label}
					</li>
				);
			})}
		</ol>
	);
}

function DeliveryDetail({
	id,
	onChanged,
	onError,
	geocodingConfigured,
}: {
	id: string;
	onChanged: () => Promise<void>;
	onError: (message: string | null) => void;
	geocodingConfigured: boolean;
}) {
	const [delivery, setDelivery] = useState<DeliveryRow | null>(null);
	const [events, setEvents] = useState<DeliveryEventRow[]>([]);
	const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	// Null until asked. A collection takes a moment to reach GDEX's board, so
	// "not checked yet" and "not there" must not look the same.
	const [pickup, setPickup] = useState<{
		reference: string | null;
		status: string | null;
		collectingOn: string | null;
		message: string;
	} | null>(null);
	const [bookedBy, setBookedBy] = useState("");

	// Read after mount, not in the initial state: `localStorage` does not exist
	// on the server, and a value read during render would not survive
	// hydration.
	useEffect(() => {
		setBookedBy(localStorage.getItem("ic.logistics.actor") ?? "");
	}, []);

	const rememberActor = (name: string) => {
		setBookedBy(name);
		localStorage.setItem("ic.logistics.actor", name);
	};

	const read = useCallback(async () => {
		const res = await fetch(`/api/admin/deliveries/${id}`);
		if (!res.ok) return;
		const body = await res.json();
		setDelivery(body.delivery);
		setEvents(body.delivery?.events ?? []);
	}, [id]);

	useEffect(() => {
		read();
	}, [read]);

	// Re-read our own row while the job is moving, so a webhook or a cron sweep
	// shows up without the admin reloading the page.
	//
	// Keyed on the status, not on `delivery`: every poll replaces that object,
	// so depending on it tore the interval down and built a new one on each
	// tick — a timer restarting itself four times a minute for no reason.
	const movingStatus =
		delivery && ACTIVE.includes(delivery.status) ? delivery.status : null;
	useEffect(() => {
		if (movingStatus === null) return;
		const timer = setInterval(read, POLL_MS);
		return () => clearInterval(timer);
	}, [movingStatus, read]);

	async function compare() {
		setBusy("compare");
		onError(null);
		const res = await fetch(`/api/admin/deliveries/${id}/quotes`, {
			method: "POST",
		});
		setBusy(null);
		if (!res.ok) {
			onError("Could not reach the logistics partners");
			return;
		}
		const body = await res.json();
		const rows: QuoteRow[] = body.quotes ?? [];
		setQuotes(rows);
		setSelected(defaultChoice(rows));
		await read();
		await onChanged();
	}

	async function book() {
		const choice = quotes?.find((quote) => quote.carrierId === selected);
		if (!choice) return;
		setBusy("book");
		onError(null);
		const res = await fetch(`/api/admin/deliveries/${id}/book`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				carrierId: choice.carrierId,
				bookedBy,
				quotedPriceRm: choice.priceRm,
			}),
		});
		setBusy(null);
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			if (body?.error === "price_moved") {
				onError(
					`The price moved to RM ${body.currentPriceRm} — compare again before booking.`,
				);
				return;
			}
			// Append rather than replace: an unreadable carrier reply must still
			// leave our own sentence on screen. Same shape as the cancel path.
			const said = messageFor(body?.error, "Booking failed");
			onError(body?.message ? `${said} (${body.message})` : said);
			return;
		}
		setQuotes(null);
		await read();
		await onChanged();
	}

	/** Ask GDEX what it has scheduled, rather than trusting our own success. */
	async function checkPickup() {
		setBusy("pickup");
		onError(null);
		const res = await fetch(`/api/admin/deliveries/${id}/pickup`, {
			method: "POST",
		});
		setBusy(null);
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			onError(messageFor(body?.error, "Could not check the collection"));
			return;
		}
		setPickup(body.pickup);
	}

	async function refreshFromCarrier() {
		setBusy("track");
		onError(null);
		const res = await fetch(`/api/admin/deliveries/${id}/track`, {
			method: "POST",
		});
		setBusy(null);
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			onError(messageFor(body?.error, "Could not reach the carrier"));
			return;
		}
		await read();
		await onChanged();
	}

	async function advance(status: DeliveryStatusName) {
		if (bookedBy.trim() === "") {
			onError("Put your name in the field above — it goes on the record.");
			return;
		}
		setBusy(status);
		onError(null);
		const res = await fetch(`/api/admin/deliveries/${id}/advance`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status, actor: bookedBy }),
		});
		setBusy(null);
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			if (body?.error === "carrier_refused_cancel") {
				onError(
					`The carrier would not cancel this job — ring them. (${body.message})`,
				);
				return;
			}
			onError(messageFor(body?.error, "Could not update this job"));
			return;
		}
		await read();
		await onChanged();
	}

	if (!delivery) {
		return (
			<p className="border-neutral-200 border-t px-4 py-4 text-[13px] text-neutral-500">
				Loading…
			</p>
		);
	}

	const booked = delivery.carrierOrderId !== null;
	// A cancelled or failed job is off the journey, so there is no next stop to
	// offer — `indexOf` returning -1 used to make "Mark booked" the next move on
	// a job the carrier had already cancelled.
	const onJourney = JOURNEY.indexOf(delivery.status);
	const nextStep = onJourney === -1 ? undefined : JOURNEY[onJourney + 1];
	const stopped =
		delivery.status === "CANCELLED" || delivery.status === "FAILED";
	const stoppedAt =
		events.find((event) => event.status === delivery.status)?.at ?? null;
	const steps = journeySteps(delivery.status, events, delivery.carrierId);
	const tags = quotes === null ? {} : quoteTags(quotes);
	const choice = quotes?.find((q) => q.carrierId === selected) ?? null;

	// Which of the three moves is being made now — the stepper and the sentence
	// under it are the same fact said twice, so they read it from one place.
	const stage = booked
		? 3
		: busy === "book"
			? 2
			: quotes === null || busy === "compare"
				? 0
				: 1;

	const guide = stopped
		? delivery.status === "CANCELLED"
			? "This job was cancelled. Nothing will be collected — the tracker below shows how far it got before it stopped."
			: "This job failed with the carrier. Nothing will be collected — the tracker below shows how far it got."
		: booked
			? "Pickup is booked. Follow the shipment below; refresh from the carrier for a fresh position."
			: busy === "compare"
				? "Asking every partner what this job costs. Nothing is booked yet."
				: quotes === null
					? "Start by comparing partners. Nothing reaches a carrier until you book."
					: busy === "book"
						? `Creating the job with ${carrierLabel(choice?.carrierId)}. Stay on this page until it confirms.`
						: "Compare the prices below, pick a partner, then book the pickup.";

	const copyLink = async () => {
		if (delivery.trackingUrl === null) return;
		await navigator.clipboard.writeText(delivery.trackingUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="flex flex-col gap-5 border-neutral-200 border-t px-4 py-4">
			<section className="flex flex-col rounded-xl border border-neutral-200 bg-white px-5 py-4">
				<p className="mb-2.5 font-semibold text-[12px] text-neutral-600 uppercase tracking-[.06em]">
					On the lorry
				</p>
				{delivery.items.length === 0 ? (
					<p className="text-[13px] text-neutral-500">Nothing listed yet.</p>
				) : (
					delivery.items.map((item) => (
						<div
							key={`${item.label}-${item.widthMm}-${item.heightMm}-${item.depthMm}`}
							className="flex justify-between gap-3 py-1.5 text-[13px]"
						>
							<span>
								{item.label}{" "}
								<span className="text-[#8a857c]">× {item.qty}</span>
							</span>
							<span className="shrink-0 text-neutral-500 tabular-nums">
								{item.widthMm} × {item.heightMm} × {item.depthMm} mm
								{item.weightKg === null ? "" : ` · ${item.weightKg} kg`}
							</span>
						</div>
					))
				)}
				<p className="mt-1.5 border-[#ecebe7] border-t pt-2.5 text-[13px] font-semibold">
					{delivery.totalVolumeM3 ?? 0} m³
					{delivery.totalWeightKg === null
						? ", weight not given"
						: `, ${delivery.totalWeightKg} kg`}
				</p>
				<p className="mt-2.5 text-[12px] text-[#5c574e]">
					Deliver to: {delivery.siteAddress}
				</p>
			</section>

			<div className="grid grid-cols-1 gap-1 text-[12px] text-neutral-500 sm:grid-cols-2">
				<p>Phone: {delivery.customerPhone}</p>
				<p>Pickup: {delivery.pickupAddress}</p>
				{delivery.addressNotes && <p>Access: {delivery.addressNotes}</p>}
				{delivery.siteLat !== null && (
					<p>
						Site pin: {delivery.siteLat}, {delivery.siteLng}
					</p>
				)}
				{!booked &&
					(["site", "pickup"] as const).map((stop) => {
						const state = pinState(
							stop === "site" ? delivery.siteLat : delivery.pickupLat,
							geocodingConfigured,
						);
						if (state === "located") return null;
						return (
							<p key={stop} className="text-amber-700 sm:col-span-2">
								The {stop} address {PIN_TROUBLE[state].reason} Vehicle partners
								price by coordinate, so only own lorry can be booked.{" "}
								{PIN_TROUBLE[state].action}
							</p>
						);
					})}
			</div>

			{!stopped && <ProcessSteps stage={stage} />}

			<p
				className={`flex items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[12px] leading-[18px] ${
					stopped
						? STOPPED_TONE[delivery.status]
						: booked
							? "border-[#bcd0c3] bg-[#f2f7f4] text-[#17402c]"
							: "border-neutral-200 bg-[#f8f7f4] text-neutral-700"
				}`}
			>
				<span className="shrink-0 font-bold">
					{stopped
						? STATUS_LABEL[delivery.status]
						: booked
							? "Done"
							: `Step ${stage + 1} of 3`}
				</span>
				<span>{guide}</span>
			</p>

			{!booked && (
				<div className="flex flex-col gap-3">
					<button
						type="button"
						className={`${chipClass(false)} self-start`}
						onClick={compare}
						disabled={busy !== null}
					>
						{quotes === null ? "Compare partners" : "Compare again"}
					</button>

					{busy === "compare" && (
						<div className="flex items-center gap-2.5 rounded-[10px] border border-neutral-200 bg-[#faf9f7] px-4 py-3">
							<Spinner />
							<span className="text-[13px] text-neutral-700">
								Asking every partner what this job costs…
							</span>
						</div>
					)}

					{quotes !== null && quotes.length === 0 && (
						<p className="text-[13px] text-neutral-500">
							No logistics partner is configured yet. Add a partner's
							credentials to compare real prices — until then, book the job as
							own lorry and record it by hand.
						</p>
					)}

					{quotes !== null && quotes.length > 0 && (
						<div className="flex flex-col gap-2">
							{quotes.map((quote) => {
								const active = selected === quote.carrierId;
								const failed = quote.error !== undefined;
								const tag = tags[quote.carrierId];
								return (
									<button
										key={quote.carrierId}
										type="button"
										aria-pressed={active}
										disabled={failed || busy !== null}
										onClick={() => setSelected(quote.carrierId)}
										className={`flex flex-col gap-1 rounded-xl border-[1.5px] px-4 py-3 text-left ${
											active
												? "border-[#1f5138] bg-[#f2f7f4]"
												: "border-neutral-200 bg-white"
										} ${failed ? "opacity-70" : ""}`}
									>
										<span className="flex w-full items-center gap-2">
											<span
												className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-[#1f5138]" : "bg-neutral-300"}`}
											/>
											<span className="font-semibold text-[13px]">
												{carrierLabel(quote.carrierId)}
											</span>
											{tag && (
												<span
													className={`shrink-0 rounded-full px-2 py-0.5 font-bold text-[10px] ${
														tag === "Cheapest"
															? "bg-[#eef3ef] text-[#1f5138]"
															: "bg-[#f2efe6] text-[#6b5f2e]"
													}`}
												>
													{tag}
												</span>
											)}
											<span className="ml-auto shrink-0 font-semibold text-[13px] tabular-nums">
												{failed
													? "—"
													: quote.priceRm === null
														? "Price agreed by phone"
														: `RM ${quote.priceRm}`}
											</span>
										</span>
										{quote.notes && (
											<span className="pl-[18px] text-[11px] text-[#8a857c]">
												{quote.notes}
											</span>
										)}
										{quote.warning && (
											<span className="pl-[18px] text-[11px] text-[#8a6d1f]">
												{quote.warning}
											</span>
										)}
										<span className="flex items-center gap-2 pl-[18px] text-[11px]">
											{quote.error ? (
												<span className="text-red-700">{quote.error}</span>
											) : quote.etaMinutes !== null ? (
												<span className="text-[#8a857c]">
													~{quote.etaMinutes} min
												</span>
											) : null}
											{active && (
												<span className="font-semibold text-[#1f5138]">
													Selected
												</span>
											)}
										</span>
									</button>
								);
							})}
						</div>
					)}

					{busy === "book" && (
						<div className="flex items-center gap-2.5 rounded-[10px] border border-neutral-200 bg-[#faf9f7] px-4 py-3">
							<Spinner />
							<span className="text-[13px] text-neutral-700">
								Booking with {carrierLabel(choice?.carrierId)} — creating the
								job…
							</span>
						</div>
					)}

					{choice && busy === null && (
						<div className="flex flex-col gap-2">
							<label className="flex flex-col gap-1 text-[12px] text-neutral-500">
								Your name — recorded against the booking
								<input
									className={fieldClass(false, "max-w-[260px]")}
									value={bookedBy}
									onChange={(e) => rememberActor(e.target.value)}
								/>
							</label>
							<button
								type="button"
								className="self-start rounded-full bg-[#1f5138] px-5 py-2.5 font-semibold text-[13px] text-white disabled:opacity-40"
								disabled={bookedBy.trim() === ""}
								onClick={book}
							>
								Book pickup with {carrierLabel(choice.carrierId)}
								{choice.priceRm === null ? "" : ` — RM ${choice.priceRm}`} →
							</button>
							<p className="text-[12px] text-neutral-500">
								This books a real vehicle with the partner.
							</p>
						</div>
					)}
				</div>
			)}

			{booked && (
				<section className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-4">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div>
							<p className="mb-1 font-semibold text-[12px] text-neutral-600 uppercase tracking-[.06em]">
								Shipment tracking
							</p>
							<p className="text-[13px] text-[#5c574e]">
								{carrierLabel(delivery.carrierId)} ·{" "}
								<span className="font-mono">{delivery.carrierOrderId}</span>
							</p>
						</div>
						<div className="text-right">
							<p className="mb-0.5 text-[11px] text-[#8a857c]">Scheduled</p>
							<p className="font-semibold text-[13px]">
								{delivery.scheduledAt ? shortTime(delivery.scheduledAt) : "—"}
							</p>
						</div>
					</div>

					<div className={`flex ${stopped ? "opacity-60" : ""}`}>
						{steps.map((step, i) => (
							<div
								key={step.status}
								className="flex flex-1 flex-col items-center"
							>
								<div className="flex w-full items-center">
									<div
										className={`h-0.5 flex-1 ${
											i === 0
												? "bg-transparent"
												: step.state === "pending"
													? "bg-neutral-200"
													: "bg-[#1f5138]"
										}`}
									/>
									<span
										className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 text-[12px] text-white ${
											step.state === "pending"
												? "border-neutral-300 bg-neutral-300"
												: "border-[#1f5138] bg-[#1f5138]"
										} ${step.state === "active" ? "ring-[3px] ring-[#dbe8e0]" : ""}`}
									>
										{step.state === "done" ? "✓" : ""}
									</span>
									<div
										className={`h-0.5 flex-1 ${
											i === steps.length - 1
												? "bg-transparent"
												: steps[i + 1].state === "pending"
													? "bg-neutral-200"
													: "bg-[#1f5138]"
										}`}
									/>
								</div>
								<p
									className={`mt-2.5 mb-0.5 text-center font-semibold text-[12px] ${
										step.state === "pending"
											? "text-[#a3a19b]"
											: "text-neutral-900"
									}`}
								>
									{step.label}
								</p>
								<p className="text-center text-[11px] text-[#8a857c]">
									{step.at ? shortTime(step.at) : "—"}
								</p>
							</div>
						))}
					</div>

					{stopped && (
						<p
							className={`rounded-[9px] border px-3 py-2.5 text-[12px] ${STOPPED_TONE[delivery.status]}`}
						>
							{STATUS_LABEL[delivery.status]}
							{stoppedAt ? ` ${shortTime(stoppedAt)}` : ""} — the stops above
							are where it got to. No further updates will come from{" "}
							{carrierLabel(delivery.carrierId)}.
						</p>
					)}

					<div className="flex flex-wrap items-center gap-3 text-[12px] text-neutral-500">
						{delivery.quotedPriceRm !== null && (
							<span>RM {delivery.quotedPriceRm}</span>
						)}
						{delivery.bookedBy && <span>Booked by {delivery.bookedBy}</span>}
						{(delivery.driverName || delivery.vehiclePlate) && (
							<span className="text-neutral-900">
								Driver {delivery.driverName ?? "—"}
								{delivery.driverPhone ? ` · ${delivery.driverPhone}` : ""}
								{delivery.vehiclePlate ? ` · ${delivery.vehiclePlate}` : ""}
							</span>
						)}
						<span>
							{delivery.lastLatitude === null
								? "No position reported yet."
								: `Last seen ${delivery.lastLatitude}, ${delivery.lastLongitude}${
										delivery.lastLocationAt
											? ` at ${new Date(delivery.lastLocationAt).toLocaleTimeString()}`
											: ""
									}`}
						</span>
					</div>

					{delivery.trackingUrl && (
						<div className="flex items-center gap-2 rounded-[9px] border border-[#ecebe7] bg-[#faf9f7] px-3 py-2.5">
							<a
								className="flex-1 truncate text-[12px] underline"
								href={delivery.trackingUrl}
								target="_blank"
								rel="noreferrer"
							>
								{delivery.trackingUrl}
							</a>
							<button
								type="button"
								className="shrink-0 font-semibold text-[12px] text-[#1f5138]"
								onClick={copyLink}
							>
								{copied ? "Copied" : "Copy"}
							</button>
						</div>
					)}

					{delivery.carrierId === "gdex" && !stopped && (
						<div className="flex items-center gap-2.5 rounded-[9px] border border-[#cddcd3] bg-[#f2f7f4] px-3 py-2.5">
							<span className="flex-1 text-[12px] text-[#1a4a33]">
								{pickup === null
									? "GDEX schedules the collection on their own board. Check that it landed."
									: pickup.message}
								{pickup?.collectingOn
									? ` · collecting ${pickup.collectingOn}`
									: ""}
							</span>
							<button
								type="button"
								className="shrink-0 font-semibold text-[12px] text-[#1f5138]"
								onClick={checkPickup}
								disabled={busy !== null}
							>
								{busy === "pickup"
									? "Checking…"
									: pickup === null
										? "Check collection"
										: "Check again"}
							</button>
						</div>
					)}

					{delivery.labelUrl && (
						<a
							className="text-[12px] font-semibold text-[#1f5138] underline"
							href={delivery.labelUrl}
							target="_blank"
							rel="noreferrer"
						>
							Print AWB label
						</a>
					)}

					<label className="flex flex-col gap-1 text-[12px] text-neutral-500">
						Your name — recorded against every update
						<input
							className={fieldClass(false, "max-w-[260px]")}
							value={bookedBy}
							onChange={(e) => rememberActor(e.target.value)}
						/>
					</label>

					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className={chipClass(false)}
							onClick={refreshFromCarrier}
							disabled={busy === "track"}
						>
							{busy === "track" ? "Asking carrier…" : "Refresh from carrier"}
						</button>
						{nextStep && (
							<button
								type="button"
								className={chipClass(false)}
								onClick={() => advance(nextStep)}
								disabled={bookedBy.trim() === "" || busy === nextStep}
							>
								Mark {STATUS_LABEL[nextStep].toLowerCase()}
							</button>
						)}
						{ACTIVE.includes(delivery.status) && (
							<button
								type="button"
								className={chipClass(false)}
								onClick={() => advance("CANCELLED")}
								disabled={bookedBy.trim() === ""}
							>
								Cancel job
							</button>
						)}
					</div>
				</section>
			)}

			<div className="flex flex-col gap-2">
				<p className="font-medium text-[13px]">Timeline</p>
				{events.length === 0 ? (
					<p className="text-[12px] text-neutral-500">Nothing recorded yet.</p>
				) : (
					<ul className="flex flex-col gap-2.5">
						{events.map((event) => (
							<li key={event.id} className="flex items-start gap-3">
								<span
									className={`mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ${
										event.source === "ADMIN" ? "bg-neutral-300" : "bg-[#1f5138]"
									}`}
								/>
								<div className="flex-1">
									<p className="text-[13px]">{event.message}</p>
									<p className="text-[11px] text-[#8a857c]">
										{shortTime(event.at)}
										{event.actor ? ` · ${event.actor}` : ""} ·{" "}
										{event.source.toLowerCase().replace("_", " ")}
									</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
