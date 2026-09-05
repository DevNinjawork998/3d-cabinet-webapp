import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { WORKSHOP_ADDRESS } from "@/lib/logistics/carriers";
import {
	isGeocodingConfigured,
	resolveCoordinates,
} from "@/lib/logistics/geocode";
import {
	suggestVehicle,
	totalVolumeM3,
	totalWeightKg,
} from "@/lib/logistics/measure";
import { deliveryInputSchema } from "@/lib/logistics/types";

export const runtime = "nodejs";

/** Every delivery for the admin list, newest job number first. */
export async function GET() {
	const deliveries = await prisma.delivery.findMany({
		orderBy: { number: "desc" },
	});
	return NextResponse.json({
		deliveries,
		workshopAddress: WORKSHOP_ADDRESS,
		geocodingConfigured: isGeocodingConfigured(),
	});
}

export async function POST(request: Request) {
	const parsed = deliveryInputSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	const {
		items,
		scheduledAt,
		// Pulled out of `rest` on purpose: these are the admin's *override*, not
		// columns to write. Left in the spread they would overwrite the pin
		// `resolveCoordinates` is about to find, with the null they usually are.
		siteLat,
		siteLng,
		pickupLat,
		pickupLng,
		...rest
	} = parsed.data;

	// Geocode here rather than at quote time: an address Google cannot place is
	// the admin's typo, and they are far more likely to fix it now than when a
	// partner comparison silently comes back one row short.
	const blank = { lat: null, lng: null, geocodedFor: null };
	const [site, pickup] = await Promise.all([
		resolveCoordinates(
			rest.siteAddress,
			blank,
			siteLat !== null && siteLng !== null
				? { lat: siteLat, lng: siteLng }
				: null,
		),
		resolveCoordinates(
			rest.pickupAddress,
			blank,
			pickupLat !== null && pickupLng !== null
				? { lat: pickupLat, lng: pickupLng }
				: null,
		),
	]);

	const delivery = await prisma.delivery.create({
		data: {
			...rest,
			items,
			siteLat: site.lat,
			siteLng: site.lng,
			siteGeocodedFor: site.geocodedFor,
			pickupLat: pickup.lat,
			pickupLng: pickup.lng,
			pickupGeocodedFor: pickup.geocodedFor,
			scheduledAt: scheduledAt === null ? null : new Date(scheduledAt),
			// Derived on write so the carrier payload builders and the list can
			// read them without recomputing, and so a later change to the maths
			// is visible as a migration rather than a silently different quote.
			totalVolumeM3: totalVolumeM3(items),
			totalWeightKg: totalWeightKg(items),
			events: {
				create: {
					source: "ADMIN",
					message: `Delivery created — ${suggestVehicle(items).label}`,
				},
			},
		},
	});

	return NextResponse.json({ delivery }, { status: 201 });
}
