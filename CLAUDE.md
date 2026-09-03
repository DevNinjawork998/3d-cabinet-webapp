# Cabinet planner

Public, lead-generation cabinet planner for **Infinite Cabinet Sdn Bhd** (Malaysian cabinet manufacturer). Built by JNS Nexion Enterprise.

An end customer picks a room, arranges cabinets along one wall in 3D, sees a price, and submits a quote request. Infinite Cabinet's sales team receives the lead with a rendered image attached.

**This is a marketing surface, not a production tool.** It must be convincing and fast on mid-range Android in Malaysia. It does not need to be manufacturing-accurate. A human validates every design before it becomes a real order.

Reference product: IKEA's PAX planner. Not the full IKEA room planner — one room, one wall.

## History worth knowing

The first build was a **wardrobe** configurator: a five-step stepper that split one opening into bays, at `/viewer`, on an engine in `lib/wardrobe`. It was superseded by the room planner in August 2026 and deleted (commit `5b2f0e7`). If you find a doc, comment, or branch referring to `/viewer`, `lib/wardrobe`, `components/configurator`, bays, or the `WARDROBE` product — that is the old design. Do not rebuild it. `git show 5b2f0e7^` has it if you need to read it.

The wardrobe survives only as one **family** in the planner catalogue (`id: "wardrobe"`), a plain box with no interior fit-out.

## Status

Phase 0 (catalogue + pricing spec with client) not yet complete — see Open questions. The engine, the planner UI, and the admin catalogue surface are built. A design uploaded to the library now reaches the planner: `POST /api/admin/cabinet-designs/[id]/publish` merges it into a DRAFT catalogue version, which an admin publishes. Lead capture is the remaining Phase 3 work.

**Confirmed client requirement (resolved):** Infinite Cabinet designs in SketchUp and asked for "upload SketchUp designs so we can maintain new configurations." It is resolved the literal way: the planner **renders the model they drew** — see [3D](#3d). This reversed an earlier decision to rebuild each cabinet procedurally from extracted numbers; that section carries the measurements that changed it.

**The file format is OBJ, not `.skp`, everywhere.** A `.skp` is a SketchUp-proprietary container that in practice needs SketchUp itself to read; the `openskp` reader was deleted in August 2026 along with `lib/skp`. The client exports the design folder as Wavefront OBJ — `.obj` + `.mtl` + textures — and uploads it zipped. `lib/mesh` reads it. Nothing in the app accepts a `.skp` any more: not catalogue import, not the cabinet-design library. If you are adding an upload that takes a design, it takes `.obj`/`.zip`.

## Stack

- Next.js (App Router) + TypeScript
- pnpm, Biome (lint + format)
- Tailwind
- React Three Fiber + drei for the 3D viewer
- Prisma ORM + Postgres (local via docker compose; Prisma Postgres in production)
- Vercel Blob for user-generated files and design exports
- Mux for the DIY tutorial videos — the one thing in the app that is streamed rather than generated
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
  cabinet meshes (fetched)  ·  price (server)  ·  share link  ·  SKU list (Phase 4)
```

### Dimensions are stepped, not continuous

The customer does not drag a free slider. Each family carries a **size ladder** — a fixed set of widths, each with its own price. This is deliberate and load-bearing:

- It matches how Infinite Cabinet actually manufactures — standard module sizes, not arbitrary cuts.
- It keeps pricing and the eventual BOM tractable — a finite grid of validated combinations, not a continuous space.
- It is what makes rendering the drafted model possible at all: the client draws one export per width, so every rung has a real file behind it.

Ladders live in the catalogue. `layout.ts` places and collides against them; the UI presents them as discrete choices (stepper / segmented control), never a raw slider.

### Directory layout

```text
src/
  lib/planner/           ← PURE TypeScript. No React, no three.js imports.
    catalogueSchema.ts   ← Zod schema for a published catalogue
    catalogue.ts         ← the seed catalogue + the live module palette
    layout.ts            ← placement, collision, snapping, starter layouts
    parts.ts             ← every box a cabinet is drawn from, as numbers
    exposure.ts          ← which outer sides of a cabinet nothing sits against
    pricing.ts           ← (layout, catalogue) => price breakdown
    measure.ts           ← the in-scene measuring tool
    finishTextures.ts    ← default decor photo per finish id
    __tests__/           ← vitest
  lib/catalogue/         ← DB-backed catalogue: read path, versions, diffs, blob
    versions.ts          ← createDraftVersion, the one place a DRAFT is numbered
    publishDesigns.ts    ← designs → one merge, one draft (single and batch)
    siteImages.ts        ← homepage/finish photo slots, derived from the catalogue
  lib/logistics/         ← delivery jobs and the logistics partners that move them
    carriers.ts          ← the partner vocabulary; isomorphic, no secrets
    types.ts             ← zod payloads + the CarrierAdapter contract
    measure.ts           ← items => weight, volume, the vehicle that fits
    status.ts            ← a carrier's word for a state => ours; unknown => null
    registry.ts          ← which partners we can reach right now
    adapters/            ← one file per partner; only `manual` is implemented
  lib/mesh/              ← reads an OBJ export into catalogue data
    archive.ts           ← unzip; the .obj text and the texture filenames
    objRead.ts           ← OBJ parse: named boxes in the file's own units
    normalise.ts         ← infers scale and up-axis, never assumes them
    roles.ts             ← what each panel is: naming table, geometric fallback
    strategies.ts        ← flat panels → cabinets, three strategies best-first
    extract.ts           ← cabinets → CatalogueDraft (no money, ever)
    read.ts              ← the whole run-intake path in one call
    measureDesign.ts     ← one file = one cabinet, for the design library
    renderMesh.ts        ← OBJ → grouped binary geometry the planner draws
    mergeIntoCatalogue.ts ← confirmed draft folded into the live catalogue
  lib/mux.ts             ← server-only Mux client for the tutorial videos
  components/planner/    ← R3F scene and the planner screens
    DesignedCabinet.tsx  ← draws the drafted mesh; Cabinet.tsx is the fallback
  components/admin/      ← admin chrome, DesignViewer
  app/planner/           ← the planner route
  app/tutorials/         ← the public DIY video library
  app/admin/             ← catalogue editor, cabinet designs, import, site
                           content, tutorials
  app/api/               ← admin + catalogue + site-image endpoints
```

`lib/planner` must stay framework-free. Everything in it is `(layout, catalogue) => result`. This lets us:

- build and test the whole engine against fixtures before any UI exists
- run the same code client-side for instant feedback and server-side as the authority
- lift the folder into Factory Tracker in Phase 4 without dragging UI along

If a change to `lib/planner` requires importing React or three.js, the change is wrong.

### The catalogue is a parameter, never a global

`catalogue.ts` holds the **seed**: the data this repo ships, the disaster-recovery
copy, and the fallbacks (`CONSTRUCTION`, `RATES`) that fill in whatever a
published catalogue omits. `PLANNER_CATALOGUE` is frozen. Nothing swaps it.

The live catalogue comes from the published `CatalogueVersion` and is passed
explicitly to the three things that consume it:

- `plannerEngine(catalogue)` — the placement functions in `layout.ts`, bound to
  one catalogue. A factory rather than a per-function parameter because
  `positioned` is the only place a `familyId` becomes a `Family`, but nearly
  every export reaches it.
- `computePlannerPrice(layout, finish, catalogue)` — the money path, which also
  takes its rates off that catalogue via `ratesOf`.
- `<CatalogueProvider catalogue={…}>` in `components/planner/CatalogueContext.tsx`
  — the client tree, which reads `useCatalogue()` for palettes and `useEngine()`
  for placement.

This replaced a mutable module palette that `setActivePlannerCatalogue` swapped
in place. It was three bugs at once: a door-price copy that never got swapped, a
global mutated during React's render phase, and a server-rendered starter layout
built from the seed but priced against the published catalogue — which fell
through `?? 0` whenever a publish changed a size ladder. A fourth, quieter bug
rode along with it: `pricing.ts` read worktop, ceiling-trim, skirting and all
three end-panel rates off the module-level `RATES` global rather than the
catalogue argument, so on the server — where price is authoritative — those six
rates always priced at the bundled placeholders regardless of what was
published. "Which catalogue is live" is now a value with an owner.

### Non-negotiables

- **Price is computed server-side.** The client may show an indicative figure; the authoritative number comes from the API. Never trust a client-submitted price.
- **`schemaVersion` on every stored document.** Public share links must survive schema changes. A customer's WhatsApp link rendering wrong is a lost sale.
- **Zod is the single source of truth for types.** Define the schema once, infer TS types from it, validate every API payload. Malformed input on a public endpoint is guaranteed.
- **Sizes are validated against the family's ladder.** Reject off-ladder widths server-side.
- **The catalogue lives in the database, seeded from the repo.** `lib/planner/catalogue.ts` is the seed and the disaster-recovery copy; the live values come from the published `CatalogueVersion`. Ship catalogue changes as their own commit so price history stays greppable.

## 3D

**The planner draws the model the drafter drew.** Infinite Cabinet designs every
cabinet in SketchUp and exports it as OBJ. That drawing is the deliverable, and
the software's job is to ingest it and put it in front of a customer — not to
re-derive a cabinet somebody has already drawn.

This reverses what this document said until August 2026. The old rule —
*"nothing in the scene is an image or a loaded model"* — rebuilt every cabinet
from eleven extracted numbers, and the visible result was a Häfele Axilo 48
leveller rendered as a plain grey cylinder. The three arguments for it do not
survive contact with the numbers:

| The old objection | What is actually true |
| --- | --- |
| "Heavy web geometry that fights the mobile budget" | The client's whole wall run is **8,058 verts / 13,896 triangles**. As binary that is **176 KB** — about what *one* of their decor photos costs (`Rhone Oak.jpg` is 178 KB). One cabinet is ~25 KB, ~13 KB gzipped. The old figure was measuring OBJ *text*, which is ASCII floats at ~6× the binary. |
| "A baked mesh cannot resize to the size ladder" | True, and irrelevant: the ladder was never continuous. The customer picks from a fixed set of widths, and the client already draws **one export per width** — BC 800, BC 900, BC 1000. The ladder *is* the set of files. |
| "No parameters, so it can never produce a price or a BOM" | Price and BOM come from the layout document and the catalogue row. Geometry never fed them and still does not. The mesh is purely visual. |

### What is drawn from a file, and what is not

| | Source |
| --- | --- |
| Cabinet geometry | **the drafted mesh, 1:1** |
| Room shell — floor, walls, ceiling | procedural. No file describes the customer's room |
| Worktop spanning a run | procedural. It crosses cabinets, so no single export has it |
| Finish, door style | **our** materials, painted per classified mesh group |
| Price | the catalogue row |

### Classified at intake, not at runtime

`lib/mesh/renderMesh.ts` converts an upload once, on the server, and the browser
receives grouped binary geometry — never an OBJ, never a loader.

```
BC 800mm.obj  (private Blob — carries their part naming)
      ↓  readObjMesh · normalise · classify        (lib/mesh)
      ↓  bucket triangles by role, write binary
  cabinet mesh  ~42 KB / ~13 KB gzipped
   groups: carcass · door · drawerFront · shelf · hardware · other
      ↓  GET /api/cabinet-mesh/[id]   (public, immutable)
  DesignedCabinet.tsx → BufferGeometry
```

**The mesh is grouped by role, and that is load-bearing.** Two features carry
the sale, and both need to know which triangles are fronts:

- the **finish picker**, which paints the customer's colour onto exactly the
  surfaces a sprayer would paint;
- the **doors-open/hidden toggle**, which hides those groups and nothing else.

`roles.ts` already classifies from the drafter's own group names (`Door_L_`,
`G-UEnd_(R)`). That classification used to be discarded; now it decides the
buckets. The drafter's own materials are dropped — the export carries ~900 KB of
re-encoded texture copies (`RotText12.jpg`) whose names map to nothing, and the
grain tile tinted per finish is both smaller and better.

**Nothing is dropped for being unrecognised.** A record `roles.ts` cannot place
goes to `other` and is still drawn, with a neutral material. `readObj` discards
`G-Object.041` as carrying no readable design intent — but in the client's own
sample job that record *is* the adjustable feet. Unrecognised is not unwanted.

**`Cabinet.tsx` is the fallback, not the primary.** Six procedural boxes rebuilt
from `parts.ts`, still rendered for a family with no published mesh: every
catalogue published before this, and any design whose file would not convert. Do
not delete it — a design that fails to parse must still be sellable.

The custom binary format (`ICBMESH1`: magic, a JSON group table, `Float32`
positions, `Uint32` indices) is hand-rolled for the same reason
`scripts/generate-grain-texture.mjs` hand-rolls a PNG — a GLB writer is a
dependency and an exporter's worth of spec for a file only this app reads.

### Design intake lives in `src/lib/mesh/CLAUDE.md`

How a file becomes a cabinet — scale and up-axis inference, which end is the
wall, panel roles, run grouping, the two intake paths, and the additive merge —
is documented next to the code that does it, and loads when you work there.

### Coverage is the thing to watch

A rung with no `meshDesignId` falls back to procedural geometry, and that is
fine — but it is invisible unless something says so, and the first look at the
planner proved it. One rung of thirty had a design, the kitchen starter layout
happened to place none of them, so every cabinet on screen was fallback and the
generic leg read as a broken feature rather than a missing file.

So `/admin/catalogue` badges every rung — the design and its triangle count, or
"no design · drawn procedurally", with a per-family count in the subtitle — and
`/admin/cabinet-designs` shows what each design actually converted to. A rung
pointing at a design row that no longer exists gets its own louder state, since
nothing else would ever surface that.

**Undrafted rungs stay sellable.** Hiding them would make 1:1 a guarantee rather
than a maybe, and it is the right end state — but only once coverage is high.
Today it would leave the planner with one placeable cabinet.

### `parts.ts`, and what it is still for

`lib/planner/parts.ts` returns every box in one *procedural* cabinet — sides,
top, bottom, back, legs, shelves, door leaves, drawer fronts — as
`{ role, index, centreMm, sizeMm }` in the cabinet's own frame. `Cabinet.tsx`
renders the fallback from it and `measure.ts` snaps against it. Both used to
derive the interior separately, which left the measuring tool knowing only the
outer bounding box: a shelf gap, a door reveal and a board thickness were all
unmeasurable.

`familySchema.geometry` feeds it: `shelves`, `fixedShelves`, `doorLeaves`,
`drawers`, `hasBack`, `legs`, `legHeightMm`, `legDiameterMm` and `legInsetMm`,
read off the design at intake, so the fallback at least has the right counts and
the right hardware. `standOf` floats a base carcass on feet when the design
recorded them and falls back to the recessed plinth otherwise.

The leg dimensions matter more than they look. On the client's own file the feet
are **2,248 of 2,344 triangles — 96%** of the model; the carcass is 60, the door
24, the shelf 12. They are the one place a fallback visibly differs from the
drawing, which is exactly what got noticed first. `geometryOf` measures them
(57mm across, 17mm in) rather than guessing (50 and 35), so a family that
learned geometry from *any* design improves every undrafted rung on its ladder.

Zero in either field means "not recorded" and `parts.ts` keeps its constants —
which is why they are not defaulted to those constants in the schema. A real
50mm foot and an unrecorded one have to stay distinguishable, because the merge
decides whether to learn a field by whether it has ever been set.

**Exposed ends wear the door finish.** `exposure.ts` answers which outer sides of
a cabinet have no neighbour touching them, and `PlannerScene` passes it down so
an end-of-run side renders as a veneered end panel rather than plain carcass
board — the most camera-facing surface in the default 3/4 view.

**The measuring tool snaps to whichever geometry is actually drawn.**
`snapToCabinet` takes the drafted mesh's group boxes when one has loaded and
falls back to `cabinetPartsMm` when it has not. That is not a nicety: a
dimension line taken against an idealised shelf while the scene draws the real
one is a wrong number shown to a customer. `PlannerScene` reads the mesh
synchronously through `peekDesignMesh`, because a pointer handler cannot await —
and a null there is correct rather than a race, since no mesh means procedural
boxes are what is on screen.

Onboarding a new design is a **data-entry task, not a 3D-modeling task**: name
it, price it, push it. That is what lets one person maintain the catalogue.


### Mobile performance rules

Mid-range Android is the target device.

- Lazy-load the 3D bundle behind `Suspense` so it never blocks LCP on the landing page
- `dpr={[1, 2]}`
- No real-time shadows. One directional light, one ambient, one soft blurred plane beneath the unit
- **One grayscale grain texture, tinted per finish via material colour.** `public/grain.png` is 512², ~54KB, generated by `pnpm generate:grain`, and every surface in the scene shares it. Do not ship a separate 2K PBR set per finish — eight finishes of 2K maps will destroy load time on mobile data
- **A finish can override that with a real decor photo.** The `finish:<id>` site-image slot feeds both the landing swatch and the 3D door, so uploading one supplier decor scan makes the strip and the cabinet show the same board. The photo becomes the front's `map` with the material colour set to white; the grain tile stays on as the roughness map. Absent an upload, the generated grain tinted by `finish.hex` is the fallback — see `components/planner/grain.ts`.
- **Decor scans are the supplier's IP.** Board suppliers (Max World and the like) publish decor images for their own catalogue; they are production print masters, not stock photography. Get written permission before putting one on a public page — for a fabricator that buys the board this is normally just a request to the rep
- **The geometry is not the problem; the textures are.** Measured on the client's own export: a whole wall run is 176 KB of binary geometry, one cabinet ~25 KB (~13 KB gzipped). One decor scan is 178 KB. Budget accordingly — the reflex to cut triangles is aimed at the wrong thing here.
- **Meshes are served `immutable` and fetched once per SKU.** The pathname carries the source file's sha256, so a given URL's bytes never change; `DesignedCabinet.tsx` caches the *promise*, so four identical base units in a run are one request. Prefetch sibling ladder rungs if changing a width ever feels slow.
- **A design past `MAX_TRIANGLES` (200,000) is refused** and falls back to procedural. That is not a cabinet — it is a whole room, or a file with the furniture library left switched on.
- `InstancedMesh` for shelves/drawers only if a design gets large enough to need it

Two features carry the sale: a **doors-open / doors-hidden toggle** so the customer sees their interior, and a **canvas screenshot** attached to the quote. That screenshot going out over WhatsApp is what closes the lead.

## Where assets live

| Kind | Home | Why |
| --- | --- | --- |
| Grain/laminate textures | `/public` | Static, versioned with code, free off Vercel CDN |
| Palette thumbnails | Inline SVG (`components/planner/thumbs.tsx`) | Drawn from the family's own proportions. Never boot a WebGL context per thumbnail. |
| Design exports (`.obj`, or `.zip` with textures) | Vercel Blob, **private** | The source file carries the client's module standard, layer structure and part naming. Never public, never in `/public`. Reachable only under `/api/admin`. |
| Derived render meshes (`.icbmesh`) | Vercel Blob, served **public** via `/api/cabinet-mesh/[id]` | The geometry a customer's browser draws, so it has to get out — but only as triangles, with the drafter's materials and every part name stripped. The store is private-access-only, so the route is the hole, exactly like site images. Regenerable from the source, so it is cache, not record. |
| Homepage / room / finish photos | Vercel Blob, public | Slot-keyed (`hero`, `room:<id>`, `finish:<id>`), uploaded at `/admin/site-content`. Slots are derived from the live catalogue, not hardcoded, so adding a finish adds its photo slot |
| Canvas screenshots | Vercel Blob | User-generated at runtime, one per lead |
| Quote PDFs | Vercel Blob | Same |
| Tutorial videos | **Mux**, not Blob | Needs transcoding, adaptive bitrate and a poster frame. Blob would serve one giant MP4 to a phone on Malaysian mobile data |
| Catalogue versions, designs, tutorials, site-image slots, leads, Blob URLs | Postgres | |

Test: if you could delete it and rebuild it from a `git clone`, it belongs in the repo, not Blob.

**Never base64 images into a Postgres column.** A design export is ~2 MB; a screenshot is tens of KB; a render mesh is ~42 KB. All of them live in Blob and only the pathname lives in a column. `CabinetDesign.meshGroups` is the one piece of derived geometry in Postgres, and it is a role/triangle-count summary for the review table — the planner never reads it, because the binary carries its own group table.

## UX flow

Three screens, each with a sensible default so an impatient user lands on something that looks good in 3D. Blank canvases kill conversion.

1. **Start** — pick a room; it opens on that room's starter layout
2. **Studio** — drag cabinets in, resize, choose doors and finish, measure
3. **Quote** — price breakdown + request quote

**No login to configure.** The email/WhatsApp gate sits at **"save & share"**, not at entry — by then the customer has sunk time into a design and will trade a phone number to keep it.

Save writes the layout to Postgres under a `nanoid` slug, returns a short URL, creates the lead record, and attaches the screenshot. Then a `wa.me` deep link with the design URL prefilled.

Ship 8–10 **preset designs** as their own indexable routes ("2.4m 3-door kitchen run", etc). Each is an SEO landing page and an entry point into the planner — solves the blank-canvas problem and the traffic problem together.

### The studio's own chrome

- **A breadcrumb header** (`PlannerHeader.tsx`) instead of a stepper — the planner is one screen you stay on, not a wizard.
- **3D / elevation / plan toggle** (`PlannerView` in `PlannerScene.tsx`). Elevation and plan are orthographic and axis-locked: the point of an elevation is that it stays square, so one stray drag must not knock it off.
- **Room dimensions are editable in place** (`DimensionField.tsx`), ceiling height among them — it is a layout dimension in `PlannerLayout`, clamped by `CEILING_LIMITS`, not a constant, because it decides whether a tall unit fits.

### Tutorials

`/tutorials` is a public DIY video library; `/admin/tutorials` uploads to Mux with `@mux/upchunk` (direct-to-Mux, so the video never passes through a function) and polls `[id]/status` until the asset is ready. `lib/mux.ts` is `server-only` — those are write credentials for the video account and must never reach a customer's bundle.

This is the one place the app streams something it did not generate. It is a separate surface from the planner and shares nothing with it.

## Auth

None for the public planner. The admin surface is a **shared-secret cookie** (`lib/adminAuth.ts`, HMAC over `ADMIN_PASSWORD`, gated in `proxy.ts`) — three internal users, one locked door, no user table. Upgrade to per-user accounts (Auth.js or Better Auth) when the Phase 3 lead inbox needs to know *which* admin did something.

## Relationship to Factory Tracker

Separate repository, deliberately. Factory Tracker is an authenticated B2B dashboard where bundle size barely matters; this is a public marketing surface where three.js weight decides whether the lead ever loads the page. Different audiences, deploy cadences, and risk profiles. A planner hotfix must not redeploy a system the factory floor depends on.

Phase 4 integration is a **versioned HTTP contract**, not a monorepo. Factory Tracker exposes `POST /api/v1/production-orders`; the planner calls it with a signed payload. Extract a shared types package only if that becomes painful.

Separate Postgres database from Factory Tracker.

## Phasing

| Phase | Work |
| --- | --- |
| 0 | Catalogue + pricing spec workshop with client, including the design-intake process |
| 1 | Layout schema, rules, pricing — headless, tested against fixtures ✅ |
| 2 | Planner UI + 3D scene ✅ |
| 3 | Lead capture, share links, admin inbox (admin catalogue + designs ✅; lead capture not started) |
| 4 | Approved quote → **SKU list** → production job in Factory Tracker |

**Phase 4 changed shape when the planner started rendering the drafted model.** A derived cut list is no longer available, because the app no longer derives the cabinet — it draws the one the client already drew. What Factory Tracker receives is a SKU list (`1× BC 800mm`). For a factory that manufactures to standard modules that is arguably the more useful payload, but it is a change to the contract and **the client should hear it**.

## Known issues

Recorded rather than fixed. Do not paper over them; fix them deliberately.

1. **Drafter naming is load-bearing now.** `roles.ts` classifies mesh groups from the drafter's own names, and that classification decides which triangles take the customer's finish and which disappear on the doors-hidden toggle. A renamed group used to cost an inferred shelf count; it now costs the finish picker on that cabinet. The review table shows the classification before publish and the fallback is one material across the whole mesh, but this belongs in the Phase 0 conversation about drafting conventions.
2. **A junk `Testing123` family, 1000–1000mm, is still in the live catalogue.** Left behind by `lib/catalogue/cabinetDesignToFamily.ts` (deleted in `84f4cb7`), which mapped a design straight to a family with a single-rung ladder; the design row it came from was deleted long ago. Harmless but visible — remove it in a catalogue-only commit.

## Open questions — resolve before trusting pricing.ts

- **How does Infinite Cabinet actually price cabinets?** The engine currently models it **per unit** — each carcass size is its own priced line, each door priced by the width it covers, worktop by the running foot. Confirm that matches their price list.
- **Does the public tool show a firm price or an indicative range?** Sales teams often resist public exact pricing. This is a business decision and it changes the UI.
- **The real size ladders** per family — widths, heights, depths — from their standard modules.
- **Their real module standard** for living room, bedroom, and foyer. Only the kitchen dimensions come from a real design export; the rest are invented.
- **What does `Door_L_` mean?** The left-hand leaf of a pair, or a door hinged
  on its left stile? `hingeSideFromName` reads the token, but only trusts it for
  a *lone* door — on a pair the outward rule already answers it, and guessing
  the convention would be reading handedness into what may only be position.
  Their answer decides whether a single door's drawn name can seed its swing.
- **Design-intake cadence.** How often do new exports arrive, and will the panel naming (`G-UEnd_(L)`, `G-Door(R)`, …) stay stable? Extraction depends on it, so a change in their drawing habits is a change to `lib/mesh`.
- Does Prisma Postgres offer an ap-southeast region? If not, quote submission eats a transpacific round trip.

## Conventions

- Sentence case in UI copy. Prices in RM.
- Every `lib/planner` function gets a test before it gets a caller.
- Commit catalogue changes separately from code changes so price history is greppable.
