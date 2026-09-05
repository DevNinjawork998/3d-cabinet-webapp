"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { chipClass, fieldClass } from "@/components/admin/styles";
import { LABEL } from "@/lib/logistics/carriers";
import {
	suggestVehicle,
	totalVolumeM3,
	totalWeightKg,
} from "@/lib/logistics/measure";
import type { DeliveryStatusName } from "@/lib/logistics/types";
import {
	blankForm,
	type DeliveryEventRow,
	type DeliveryRow,
	EDITABLE,
	emptyItem,
	type FormItem,
	type FormState,
	formFrom,
	type QuoteRow,
	toPayload,
} from "./form";

export type { DeliveryEventRow, DeliveryRow, QuoteRow } from "./form";

/**
 * The whole delivery screen: the list, the job form, and the detail panel where
 * partners are compared, one is booked, and the job is then followed.
 *
 * Client-side like the other admin screens — fetch on mount into state, mutate
 * through `/api/admin/deliveries`, then reload. Nothing here is public, so none
 * of it needs to be server-rendered.
 */

const STATUS_LABEL: Record<DeliveryStatusName, string> = {
	DRAFT: "Draft",
	QUOTED: "Quoted",
	BOOKED: "Booked",
	DRIVER_ASSIGNED: "Driver assigned",
	PICKED_UP: "Picked up",
	IN_TRANSIT: "In transit",
	DELIVERED: "Delivered",
	CANCELLED: "Cancelled",
	FAILED: "Failed",
};

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

/** The states a job passes through, in the order the timeline offers them. */
const JOURNEY: DeliveryStatusName[] = [
	"BOOKED",
	"DRIVER_ASSIGNED",
	"PICKED_UP",
	"IN_TRANSIT",
	"DELIVERED",
];

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
}: {
	initial: DeliveryRow[];
	workshopAddress: string;
}) {
	const router = useRouter();
	const [rows, setRows] = useState<DeliveryRow[]>(initial);
	const [openId, setOpenId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState | null>(null);
	const [error, setError] = useState<string | null>(null);

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
			setError(
				body?.error === "already_booked"
					? "This job is booked with a carrier — change it there instead."
					: (body?.error ?? "Could not save this delivery"),
			);
			return;
		}
		setForm(null);
		await load();
	}

	async function remove(row: DeliveryRow) {
		if (!confirm(`Delete delivery ${row.number} for ${row.customerName}?`))
			return;
		const res = await fetch(`/api/admin/deliveries/${row.id}`, {
			method: "DELETE",
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			setError(
				body?.error === "already_booked"
					? "This job is booked with a carrier — cancel it there first."
					: "Could not delete this delivery",
			);
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
}: {
	state: FormState;
	onChange: (next: FormState) => void;
	onSubmit: () => void;
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
					Access notes — gate codes, unit number, who to call
					<input
						className={fieldClass(false)}
						value={state.addressNotes}
						onChange={(e) => set("addressNotes", e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-[12px] text-neutral-500 sm:col-span-2">
					Site pin — only if the address lands in the wrong place. Paste
					“3.1509, 101.5931”
					<input
						className={fieldClass(false)}
						placeholder="Found from the address"
						value={state.siteCoords}
						onChange={(e) => set("siteCoords", e.target.value)}
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
					Pickup pin
					<input
						className={fieldClass(false)}
						placeholder="Found from the address"
						value={state.pickupCoords}
						onChange={(e) => set("pickupCoords", e.target.value)}
					/>
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
				<span className="text-neutral-900">{suggestion.label}</span>. Weight is
				optional; the catalogue does not carry any, and a guessed figure would
				be quoted against.
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

function DeliveryDetail({
	id,
	onChanged,
	onError,
}: {
	id: string;
	onChanged: () => Promise<void>;
	onError: (message: string | null) => void;
}) {
	const [delivery, setDelivery] = useState<DeliveryRow | null>(null);
	const [events, setEvents] = useState<DeliveryEventRow[]>([]);
	const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<QuoteRow | null>(null);
	const [bookedBy, setBookedBy] = useState("");

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
	useEffect(() => {
		if (!delivery || !ACTIVE.includes(delivery.status)) return;
		const timer = setInterval(read, POLL_MS);
		return () => clearInterval(timer);
	}, [delivery, read]);

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
		setQuotes(body.quotes ?? []);
		await read();
		await onChanged();
	}

	async function book() {
		if (!confirming) return;
		setBusy("book");
		onError(null);
		const res = await fetch(`/api/admin/deliveries/${id}/book`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				carrierId: confirming.carrierId,
				bookedBy,
				quotedPriceRm: confirming.priceRm,
			}),
		});
		setBusy(null);
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			onError(
				body?.error === "price_moved"
					? `The price moved to RM ${body.currentPriceRm} — compare again before booking.`
					: (body?.error ?? "Booking failed"),
			);
			return;
		}
		setConfirming(null);
		setQuotes(null);
		await read();
		await onChanged();
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
			onError(body?.error ?? "Could not reach the carrier");
			return;
		}
		await read();
		await onChanged();
	}

	async function advance(status: DeliveryStatusName) {
		const actor = prompt("Your name, for the record") ?? "";
		if (actor.trim() === "") return;
		setBusy(status);
		onError(null);
		const res = await fetch(`/api/admin/deliveries/${id}/advance`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status, actor }),
		});
		setBusy(null);
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			onError(
				body?.error === "carrier_refused_cancel"
					? `The carrier would not cancel this job — ring them. (${body.message})`
					: "Could not update this job",
			);
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
	const nextStep = JOURNEY[JOURNEY.indexOf(delivery.status) + 1];

	return (
		<div className="flex flex-col gap-5 border-neutral-200 border-t px-4 py-4">
			<div className="grid grid-cols-1 gap-1 text-[12px] text-neutral-500 sm:grid-cols-2">
				<p>Phone: {delivery.customerPhone}</p>
				<p>Pickup: {delivery.pickupAddress}</p>
				{delivery.addressNotes && <p>Access: {delivery.addressNotes}</p>}
				{delivery.siteLat === null ? (
					<p className="text-amber-700 sm:col-span-2">
						Site address did not resolve to a map location. Vehicle partners
						price by coordinate, so only own lorry can be booked — edit the
						address, or paste a pin.
					</p>
				) : (
					<p>
						Site pin: {delivery.siteLat}, {delivery.siteLng}
					</p>
				)}
				<p>
					{delivery.totalVolumeM3 ?? 0} m³
					{delivery.totalWeightKg === null
						? ", weight not given"
						: `, ${delivery.totalWeightKg} kg`}
				</p>
			</div>

			{!booked && (
				<div className="flex flex-col gap-3">
					<button
						type="button"
						className={`${chipClass(false)} self-start`}
						onClick={compare}
						disabled={busy === "compare"}
					>
						{busy === "compare" ? "Asking partners…" : "Compare partners"}
					</button>

					{quotes !== null && quotes.length === 0 && (
						<p className="text-[13px] text-neutral-500">
							No logistics partner is configured yet. Add a partner's
							credentials to compare real prices — until then, book the job as
							own lorry and record it by hand.
						</p>
					)}

					{quotes !== null && quotes.length > 0 && (
						<ul className="flex flex-col gap-2">
							{quotes.map((quote) => (
								<li
									key={quote.carrierId}
									className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2"
								>
									<span className="min-w-[120px] flex-1 font-medium text-[13px]">
										{LABEL[quote.carrierId] ?? quote.carrierId}
									</span>
									{quote.error ? (
										<span className="text-[12px] text-red-700">
											{quote.error}
										</span>
									) : (
										<>
											<span className="text-[13px] tabular-nums">
												{quote.priceRm === null
													? "Price agreed by phone"
													: `RM ${quote.priceRm}`}
											</span>
											{quote.etaMinutes !== null && (
												<span className="text-[12px] text-neutral-500">
													~{quote.etaMinutes} min
												</span>
											)}
											<button
												type="button"
												className={chipClass(
													confirming?.carrierId === quote.carrierId,
												)}
												onClick={() => setConfirming(quote)}
											>
												Book
											</button>
										</>
									)}
								</li>
							))}
						</ul>
					)}

					{confirming && (
						<div className="flex flex-col gap-2 rounded-lg bg-[#f4f3f1] p-3">
							<p className="text-[13px]">
								Book{" "}
								<span className="font-medium">
									{LABEL[confirming.carrierId] ?? confirming.carrierId}
								</span>{" "}
								for{" "}
								<span className="font-medium">
									{confirming.priceRm === null
										? "a price agreed by phone"
										: `RM ${confirming.priceRm}`}
								</span>
								. This books a real vehicle.
							</p>
							<label className="flex flex-col gap-1 text-[12px] text-neutral-500">
								Your name — recorded against the booking
								<input
									className={fieldClass(false, "max-w-[260px]")}
									value={bookedBy}
									onChange={(e) => setBookedBy(e.target.value)}
								/>
							</label>
							<div className="flex gap-2">
								<button
									type="button"
									className="rounded-full bg-neutral-900 px-4 py-2 text-[13px] text-white disabled:opacity-40"
									disabled={bookedBy.trim() === "" || busy === "book"}
									onClick={book}
								>
									{busy === "book" ? "Booking…" : "Confirm booking"}
								</button>
								<button
									type="button"
									className={chipClass(false)}
									onClick={() => setConfirming(null)}
								>
									Cancel
								</button>
							</div>
						</div>
					)}
				</div>
			)}

			{booked && (
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-3 text-[12px] text-neutral-500">
						<span>
							{LABEL[delivery.carrierId ?? ""] ?? delivery.carrierId} ·{" "}
							{delivery.carrierOrderId}
						</span>
						{delivery.quotedPriceRm !== null && (
							<span>RM {delivery.quotedPriceRm}</span>
						)}
						{delivery.bookedBy && <span>Booked by {delivery.bookedBy}</span>}
						{delivery.trackingUrl && (
							<a
								className="underline"
								href={delivery.trackingUrl}
								target="_blank"
								rel="noreferrer"
							>
								Carrier tracking
							</a>
						)}
					</div>

					{(delivery.driverName || delivery.vehiclePlate) && (
						<p className="text-[13px]">
							Driver {delivery.driverName ?? "—"}
							{delivery.driverPhone ? ` · ${delivery.driverPhone}` : ""}
							{delivery.vehiclePlate ? ` · ${delivery.vehiclePlate}` : ""}
						</p>
					)}

					<p className="text-[12px] text-neutral-500">
						{delivery.lastLatitude === null
							? "No position reported yet."
							: `Last seen ${delivery.lastLatitude}, ${delivery.lastLongitude}${
									delivery.lastLocationAt
										? ` at ${new Date(delivery.lastLocationAt).toLocaleTimeString()}`
										: ""
								}`}
					</p>

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
								disabled={busy === nextStep}
							>
								Mark {STATUS_LABEL[nextStep].toLowerCase()}
							</button>
						)}
						{ACTIVE.includes(delivery.status) && (
							<button
								type="button"
								className={chipClass(false)}
								onClick={() => advance("CANCELLED")}
							>
								Cancel job
							</button>
						)}
					</div>
				</div>
			)}

			<div className="flex flex-col gap-1">
				<p className="font-medium text-[13px]">Timeline</p>
				{events.length === 0 ? (
					<p className="text-[12px] text-neutral-500">Nothing recorded yet.</p>
				) : (
					<ul className="flex flex-col gap-1">
						{events.map((event) => (
							<li key={event.id} className="text-[12px] text-neutral-500">
								<span className="tabular-nums">
									{new Date(event.at).toLocaleString()}
								</span>{" "}
								· {event.message}
								{event.actor ? ` · ${event.actor}` : ""}
								<span className="text-neutral-400"> ({event.source})</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
