"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
	SITE_IMAGE_CONTENT_TYPES,
	SITE_IMAGE_MAX_BYTES,
	siteImagePathname,
} from "@/lib/catalogue/siteImages";

/**
 * One drop target for a homepage photo.
 *
 * Uploads client-direct to Blob (Vercel Functions cap bodies at 4.5MB), then
 * records the result against the slot. There's no save button on purpose —
 * the design promises the photo is live as soon as it lands, so the write and
 * the cache purge both happen on drop.
 */

type State =
	| { status: "idle" }
	| { status: "uploading" }
	| { status: "error"; message: string };

export function ImageSlot({
	slotKey,
	label,
	placeholder,
	url,
	height,
	radius = 10,
}: {
	slotKey: string;
	label?: string;
	placeholder: string;
	/** Current photo, if the slot is filled. */
	url: string | null;
	height: number;
	radius?: number;
}) {
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const [state, setState] = useState<State>({ status: "idle" });
	const [dragging, setDragging] = useState(false);

	async function send(file: File) {
		if (!SITE_IMAGE_CONTENT_TYPES.includes(file.type)) {
			setState({ status: "error", message: "JPG, PNG, WebP or AVIF only" });
			return;
		}
		if (file.size > SITE_IMAGE_MAX_BYTES) {
			setState({ status: "error", message: "Too large — 8 MB max" });
			return;
		}

		setState({ status: "uploading" });
		try {
			const { upload } = await import("@vercel/blob/client");
			// Private, because the store only allows private — the photo is made
			// readable through `/api/site-images/[key]` instead. See
			// `siteImageSrc`.
			const blob = await upload(siteImagePathname(slotKey, file.name), file, {
				access: "private",
				handleUploadUrl: "/api/admin/site-images/upload-token",
			});

			const res = await fetch("/api/admin/site-images", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					key: slotKey,
					blobUrl: blob.url,
					blobPathname: blob.pathname,
					filename: file.name,
					sizeBytes: file.size,
				}),
			});
			if (!res.ok) {
				const body = await res.json();
				setState({ status: "error", message: body.error ?? "Could not save" });
				return;
			}
			setState({ status: "idle" });
			router.refresh();
		} catch (e) {
			setState({
				status: "error",
				message: e instanceof Error ? e.message : String(e),
			});
		}
	}

	async function clear() {
		setState({ status: "uploading" });
		await fetch(`/api/admin/site-images?key=${encodeURIComponent(slotKey)}`, {
			method: "DELETE",
		});
		setState({ status: "idle" });
		router.refresh();
	}

	return (
		<div>
			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					const file = e.dataTransfer.files[0];
					if (file) send(file);
				}}
				style={{ height, borderRadius: radius }}
				className={`relative flex w-full items-center justify-center overflow-hidden border-[1.5px] border-dashed text-center transition ${
					dragging
						? "border-neutral-900 bg-neutral-100"
						: "border-neutral-300 bg-[#fafaf9] hover:border-neutral-400"
				}`}
			>
				{url ? (
					// Plain <img>: these are arbitrary Blob URLs on a host next/image
					// isn't configured for, and the admin grid is not a place worth
					// paying for remote-image optimisation.
					// biome-ignore lint/performance/noImgElement: see above
					<img
						src={url}
						alt={placeholder}
						className="h-full w-full object-cover"
					/>
				) : (
					<span className="px-3 text-[12px] text-neutral-400">
						{state.status === "uploading" ? "Uploading…" : placeholder}
					</span>
				)}

				{url && state.status === "uploading" && (
					<span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] text-neutral-600">
						Uploading…
					</span>
				)}
			</button>

			<input
				ref={inputRef}
				type="file"
				accept={SITE_IMAGE_CONTENT_TYPES.join(",")}
				className="sr-only"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) send(file);
					e.target.value = "";
				}}
			/>

			<div className="mt-1.5 flex items-center justify-center gap-2">
				{label && <span className="text-[12px] text-neutral-600">{label}</span>}
				{url && (
					<button
						type="button"
						onClick={clear}
						className="text-[11px] text-neutral-400 hover:text-red-600"
					>
						Remove
					</button>
				)}
			</div>

			{state.status === "error" && (
				<p className="mt-1 text-[11px] text-red-600">{state.message}</p>
			)}
		</div>
	);
}
