"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginPage() {
	const router = useRouter();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function login() {
		setBusy(true);
		setError(null);
		const res = await fetch("/api/admin/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password }),
		});
		setBusy(false);
		if (!res.ok) {
			setError("Wrong password");
			return;
		}
		const next = new URLSearchParams(window.location.search).get("next");
		router.push(next || "/admin/cabinet-designs");
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-neutral-50">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					login();
				}}
				className="flex w-full max-w-xs flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
			>
				<h1 className="font-semibold text-lg">Admin</h1>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="Password"
					className="rounded border border-neutral-300 px-3 py-2 text-sm"
				/>
				{error && <p className="text-red-600 text-sm">{error}</p>}
				<button
					type="submit"
					disabled={busy || !password}
					className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
				>
					{busy ? "Checking…" : "Sign in"}
				</button>
			</form>
		</main>
	);
}
