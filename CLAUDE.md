# Cabinet planner

Public, lead-generation cabinet planner for **Infinite Cabinet Sdn Bhd** (Malaysian cabinet manufacturer). Built by JNS Nexion Enterprise.

An end customer picks a room, arranges cabinets along one wall in 3D, sees a price, and submits a quote request. Infinite Cabinet's sales team receives the lead with a rendered image attached.

**This is a marketing surface, not a production tool.** It must be convincing and fast on mid-range Android in Malaysia. It does not need to be manufacturing-accurate. A human validates every design before it becomes a real order.

Reference product: IKEA's PAX planner. Not the full IKEA room planner — one room, one wall.

## History worth knowing

The first build was a **wardrobe** configurator: a five-step stepper that split one opening into bays, at `/viewer`, on an engine in `lib/wardrobe`. It was superseded by the room planner in August 2026 and deleted (commit `5b2f0e7`). If you find a doc, comment, or branch referring to `/viewer`, `lib/wardrobe`, `components/configurator`, bays, or the `WARDROBE` product — that is the old design. Do not rebuild it. `git show 5b2f0e7^` has it if you need to read it.

The wardrobe survives only as one **family** in the planner catalogue (`id: "wardrobe"`), a plain box with no interior fit-out.

## Status

Phase 0 (catalogue + pricing spec with client) not yet complete — see Open questions. The engine, the planner UI, and the admin catalogue surface are built.

**Confirmed client requirement (resolved):** Infinite Cabinet designs in SketchUp and asked for "upload SketchUp designs so we can maintain new configurations." This is a real requirement, not a nice-to-have. It is resolved as **design intake, not a runtime asset pipeline** — see [SketchUp files are design intake, not runtime assets](#sketchup-files-are-design-intake-not-runtime-assets). Do not read "SketchUp upload" as "load a .skp/GLB into the scene."

## Stack

- Next.js (App Router) + TypeScript
- pnpm, Biome (lint + format)
- Tailwind
- React Three Fiber + drei for the 3D viewer
- Prisma ORM + Postgres (local via docker compose; Prisma Postgres in production)
- Vercel Blob for user-generated files and `.skp` job files
- Zod for the catalogue and layout schemas
- Vitest for the engine tests
- Deployed on Vercel, functions pinned to `sin1` (Singapore) — users are in Klang Valley

## Architecture

### The core rule: the layout document is the single source of truth

A design is a set of cabinets placed in rows against one wall. Each placed cabinet references a **family** (what it is) and a **size** (how wide, priced on its own rung). Everything else — 3D geometry, price, quote, and eventually the cutting list — is **derived** from that JSON. Nothing is stored twice.

```
Layout document (JSON)
  ├─ roomId:     kitchen | living | bedroom | foyer
  ├─ roomDepthMm
  ├─ rows[]:     floor and wall runs
  └─ modules[]:  familyId, widthMm, xMm, doorStyleId
        ↓
  3D geometry (client)  ·  price (server)  ·  share link  ·  BOM (Phase 4)
```

### Dimensions are stepped, not continuous

The customer does not drag a free slider. Each family carries a **size ladder** — a fixed set of widths, each with its own price. This is deliberate and load-bearing:

- It matches how Infinite Cabinet actually manufactures — standard module sizes, not arbitrary cuts.
- It keeps pricing and the eventual BOM tractable — a finite grid of validated combinations, not a continuous space.
- It makes the procedural engine simpler: geometry is regenerated at each discrete step, never interpolated.

Ladders live in the catalogue. `layout.ts` places and collides against them; the UI presents them as discrete choices (stepper / segmented control), never a raw slider.

### Directory layout

```text
src/
  lib/planner/           ← PURE TypeScript. No React, no three.js imports.
    catalogueSchema.ts   ← Zod schema for a published catalogue
    catalogue.ts         ← the seed catalogue + the live module palette
    layout.ts            ← placement, collision, snapping, starter layouts
    pricing.ts           ← (layout, catalogue) => price breakdown
    measure.ts           ← the in-scene measuring tool
    __tests__/           ← vitest
  lib/catalogue/         ← DB-backed catalogue: read path, versions, diffs, blob
  lib/skp/               ← reads a SketchUp job file into a draft catalogue
  components/planner/    ← R3F scene and the planner screens
  components/admin/      ← admin chrome
  app/planner/           ← the planner route
  app/admin/             ← catalogue editor, cabinet designs, .skp import
  app/api/               ← admin + catalogue endpoints
```

`lib/planner` must stay framework-free. Everything in it is `(layout, catalogue) => result`. This lets us:

- build and test the whole engine against fixtures before any UI exists
- run the same code client-side for instant feedback and server-side as the authority
- lift the folder into Factory Tracker in Phase 4 without dragging UI along

If a change to `lib/planner` requires importing React or three.js, the change is wrong.

### The catalogue: two reads, and why

`catalogue.ts` holds both the seed data and a **live module palette** — `FAMILIES`, `DOOR_STYLES`, `ROOM_TYPES`, `FINISHES`, `CONSTRUCTION`, `RATES` — that `setActivePlannerCatalogue()` swaps in place from the published DB row. The 3D scene, the palette UI, and `layout.ts` read that palette directly.

**`pricing.ts` does not.** It takes its catalogue as an argument and reads it through `sizePriceRmIn` / `doorStyleIn` / `doorPriceRmIn`. The money path must never depend on what a mutable global last happened to hold. Keep it that way.

That split is a known compromise, not a design to extend — see Known issues.

### Non-negotiables

- **Price is computed server-side.** The client may show an indicative figure; the authoritative number comes from the API. Never trust a client-submitted price.
- **`schemaVersion` on every stored document.** Public share links must survive schema changes. A customer's WhatsApp link rendering wrong is a lost sale.
- **Zod is the single source of truth for types.** Define the schema once, infer TS types from it, validate every API payload. Malformed input on a public endpoint is guaranteed.
- **Sizes are validated against the family's ladder.** Reject off-ladder widths server-side.
- **The catalogue lives in the database, seeded from the repo.** `lib/planner/catalogue.ts` is the seed and the disaster-recovery copy; the live values come from the published `CatalogueVersion`. Ship catalogue changes as their own commit so price history stays greppable.

## 3D

**Nothing in the scene is an image or a loaded model.** All geometry is generated procedurally from the layout document. A carcass is six boxes, a shelf is a box, a rail is a thin cylinder, a drawer front is a box. There is no GLB pipeline and no 3D artist.

Do not introduce draggable sprites or imported cabinet models. That breaks parametric resizing and kills the path to a BOM.

### SketchUp files are design intake, not runtime assets

Infinite Cabinet designs in SketchUp (`.skp`) and asked to "upload SketchUp designs." This is a confirmed requirement, and it is tempting to satisfy it by converting `.skp` → GLB and loading it into the scene. **Do not do this.** A baked mesh:

- cannot resize to the customer's discrete size ladder without ugly non-uniform stretching (panel thickness, hinges, and edges all distort);
- carries no parameters, so it can never produce a price or a BOM;
- is heavy web geometry that fights the mobile performance budget below.

Instead, a SketchUp file is a **reference for design intent**, not a thing the browser ever loads. `lib/skp` reads a job file server-side into a *draft catalogue* — dimensions and finish names, never money — which a human reviews and publishes at `/admin/import`. The browser only ever sees the published catalogue.

```
Infinite Cabinet's .skp design
        ↓  (lib/skp extracts: module layout, panel config, finishes, dimensions)
  Draft catalogue → human review at /admin/import → published CatalogueVersion
        ↓
  Procedural engine generates the resizable model in-browser
```

Onboarding a new design is therefore a **data-entry task, not a 3D-modeling task**. That is the whole point: it is what lets one person maintain the catalogue and what lets the product scale to other cabinet makers later. The SketchUp file tells us *what to build*; our code builds the resizable version.

When pitching this to the client, frame it as *"your design drives a smart, resizable configurator,"* not *"we render your file."* It's a better product and they should hear why.

### Mobile performance rules

Mid-range Android is the target device.

- Lazy-load the 3D bundle behind `Suspense` so it never blocks LCP on the landing page
- `dpr={[1, 2]}`
- No real-time shadows. One directional light, one ambient, one soft blurred plane beneath the unit
- **One grayscale grain texture at 1K, tinted per finish via material colour.** Do not ship a separate 2K PBR set per finish — eight finishes of 2K maps will destroy load time on mobile data
- `InstancedMesh` for shelves/drawers only if a design gets large enough to need it

Two features carry the sale: a **doors-open / doors-hidden toggle** so the customer sees their interior, and a **canvas screenshot** attached to the quote. That screenshot going out over WhatsApp is what closes the lead.

## Where assets live

| Kind | Home | Why |
| --- | --- | --- |
| Grain/laminate textures | `/public` | Static, versioned with code, free off Vercel CDN |
| Palette thumbnails | Inline SVG (`components/planner/thumbs.tsx`) | Drawn from the family's own proportions. Never boot a WebGL context per thumbnail. |
| SketchUp job files | Vercel Blob, **private** | A job file carries the client's module standard and part naming. Never public, never in `/public`, never loaded at runtime. |
| Canvas screenshots | Vercel Blob | User-generated at runtime, one per lead |
| Quote PDFs | Vercel Blob | Same |
| Catalogue versions, designs, leads, Blob URLs | Postgres | |

Test: if you could delete it and rebuild it from a `git clone`, it belongs in the repo, not Blob.

**Never base64 images into a Postgres column.** A job file is ~3 MB; a screenshot is tens of KB. This is the one thing that would realistically blow the storage budget.

## UX flow

Three screens, each with a sensible default so an impatient user lands on something that looks good in 3D. Blank canvases kill conversion.

1. **Start** — pick a room; it opens on that room's starter layout
2. **Studio** — drag cabinets in, resize, choose doors and finish, measure
3. **Quote** — price breakdown + request quote

**No login to configure.** The email/WhatsApp gate sits at **"save & share"**, not at entry — by then the customer has sunk time into a design and will trade a phone number to keep it.

Save writes the layout to Postgres under a `nanoid` slug, returns a short URL, creates the lead record, and attaches the screenshot. Then a `wa.me` deep link with the design URL prefilled.

Ship 8–10 **preset designs** as their own indexable routes ("2.4m 3-door kitchen run", etc). Each is an SEO landing page and an entry point into the planner — solves the blank-canvas problem and the traffic problem together.

## Auth

None for the public planner. The admin surface is a **shared-secret cookie** (`lib/adminAuth.ts`, HMAC over `ADMIN_PASSWORD`, gated in `proxy.ts`) — three internal users, one locked door, no user table. Upgrade to per-user accounts (Auth.js or Better Auth) when the Phase 3 lead inbox needs to know *which* admin did something.

## Relationship to Factory Tracker

Separate repository, deliberately. Factory Tracker is an authenticated B2B dashboard where bundle size barely matters; this is a public marketing surface where three.js weight decides whether the lead ever loads the page. Different audiences, deploy cadences, and risk profiles. A planner hotfix must not redeploy a system the factory floor depends on.

Phase 4 integration is a **versioned HTTP contract**, not a monorepo. Factory Tracker exposes `POST /api/v1/production-orders`; the planner calls it with a signed payload. Extract a shared types package only if that becomes painful.

Separate Postgres database from Factory Tracker.

## Phasing

| Phase | Work |
| --- | --- |
| 0 | Catalogue + pricing spec workshop with client, including SketchUp design-intake process |
| 1 | Layout schema, rules, pricing — headless, tested against fixtures ✅ |
| 2 | Planner UI + 3D scene ✅ |
| 3 | Lead capture, share links, admin inbox (admin catalogue + designs ✅; lead capture not started) |
| 4 | Approved quote → BOM → production job in Factory Tracker |

## Known issues

Recorded rather than fixed. Do not paper over them; fix them deliberately.

1. **`PLANNER_CATALOGUE.doorStyles` is a copy**, so `setActivePlannerCatalogue` never updates it — door prices read from that object stay at the bundled fixture.
2. **`PlannerApp.tsx` calls `setActivePlannerCatalogue` during render**, not in an effect. Global mutation in React's render phase; double-invoked under Strict Mode.
3. **`app/page.tsx` prices a starter layout against the DB catalogue while `layout.ts` built that layout from the bundled fixtures.** If a published catalogue changes a size ladder, widths fall through `?? 0` and price at zero.

All three have the same root: the live palette is a mutable module global rather than an explicit parameter. The fix is to thread the catalogue through `layout.ts` and the client tree (context) the way `pricing.ts` already does.

## Open questions — resolve before trusting pricing.ts

- **How does Infinite Cabinet actually price cabinets?** The engine currently models it **per unit** — each carcass size is its own priced line, each door priced by the width it covers, worktop by the running foot. Confirm that matches their price list.
- **Does the public tool show a firm price or an indicative range?** Sales teams often resist public exact pricing. This is a business decision and it changes the UI.
- **The real size ladders** per family — widths, heights, depths — from their standard modules.
- **Their real module standard** for living room, bedroom, and foyer. Only the kitchen dimensions come from a real `.skp` job; the rest are invented.
- **SketchUp design-intake cadence.** In what form does the client hand designs over, and how often do new ones arrive? This determines whether manual intake stays sustainable.
- Does Prisma Postgres offer an ap-southeast region? If not, quote submission eats a transpacific round trip.

## Conventions

- Sentence case in UI copy. Prices in RM.
- Every `lib/planner` function gets a test before it gets a caller.
- Commit catalogue changes separately from code changes so price history is greppable.
