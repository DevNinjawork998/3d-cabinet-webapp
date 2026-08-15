# Wardrobe Configurator

Public, lead-generation wardrobe planner for **Infinite Cabinet Sdn Bhd** (Malaysian cabinet manufacturer). Built by JNS Nexion Enterprise.

An end customer measures their space, designs a wardrobe in 3D, sees a price, and submits a quote request. Infinite Cabinet's sales team receives the lead with a rendered image attached.

**This is a marketing surface, not a production tool.** It must be convincing and fast on mid-range Android in Malaysia. It does not need to be manufacturing-accurate. A human validates every design before it becomes a real order.

Reference product: IKEA's PAX planner. Not the full IKEA room planner — we do wardrobes only, against one wall.

## Status

Greenfield. Phase 0 (catalogue spec with client) not yet complete — see Open questions.

**Confirmed client requirement (resolved):** Infinite Cabinet designs in SketchUp and asked for "upload SketchUp designs so we can maintain new configurations." This is a real requirement, not a nice-to-have. It is resolved as **design intake, not a runtime asset pipeline** — see [SketchUp files are design intake, not runtime assets](#sketchup-files-are-design-intake-not-runtime-assets). Do not read "SketchUp upload" as "load a .skp/GLB into the scene."

## Stack

- Next.js (App Router) + TypeScript
- pnpm, Biome (lint + format)
- Tailwind
- Zustand for editor state, with an undo/redo command stack
- React Three Fiber + drei for the 3D viewer
- Prisma ORM + Prisma Postgres (Starter plan, provisioned via Vercel marketplace)
- Vercel Blob for user-generated files
- Zod for the design document schema
- Vitest for the engine tests
- Deployed on Vercel, functions pinned to `sin1` (Singapore) — users are in Klang Valley

## Architecture

### The core rule: the design document is the single source of truth

A wardrobe is a run along one wall, split into bays. Each bay has a width, an interior fit-out, and a door. Everything else — 3D geometry, price, quote, and eventually the cutting list — is **derived** from that JSON. Nothing is stored twice.

```
Design document (JSON)
  ├─ opening:   W × H × D, ceiling height
  ├─ bays[]:    widths, order
  ├─ interiors: rails, shelves, drawers per bay
  └─ doors:     type, finish, handle
        ↓
  3D geometry (client)  ·  price (server)  ·  share link  ·  BOM (Phase 4)
```

### Dimensions are stepped, not continuous

The customer does not drag a free slider. They pick from a **fixed set of allowed dimension steps** the client defines (e.g. 300 / 400 / 500 … up to 900 mm). This is deliberate and load-bearing:

- It matches how Infinite Cabinet actually manufactures — standard module sizes, not arbitrary cuts.
- It keeps pricing and the eventual BOM tractable — a finite grid of validated combinations, not a continuous space.
- It makes the procedural engine simpler: geometry is regenerated at each discrete step, never interpolated.

Allowed steps live in `catalogue.ts` as typed constants. `rules.ts` validates every dimension in a design document against them and rejects off-grid values. The UI presents them as discrete choices (stepper / segmented control), never a raw slider.

### Directory layout

```text
src/
  lib/wardrobe/          ← PURE TypeScript. No React, no three.js imports.
    schema.ts            ← Zod schema for the design document
    catalogue.ts         ← allowed dimension steps, bay widths, finishes, accessories, rates (see below)
    rules.ts             ← bay splitting, dimension-step validation, constraints
    pricing.ts           ← (design) => price breakdown
    bom.ts               ← (design) => parts list (Phase 4)
    __tests__/           ← vitest, JSON fixtures
  components/configurator/   ← stepper UI
  components/viewer/         ← R3F scene
  app/api/                   ← save, quote, lead endpoints
```

`lib/wardrobe` must stay framework-free. Everything in it is `(design) => result`. This lets us:

- build and test the whole engine against JSON fixtures before any UI exists
- run the same code client-side for instant feedback and server-side as the authority
- lift the folder into Factory Tracker in Phase 4 without dragging UI along

If a change to `lib/wardrobe` requires importing React or three.js, the change is wrong.

### Non-negotiables

- **Price is computed server-side.** The client may show an indicative figure; the authoritative number comes from the API. Never trust a client-submitted price.
- **`schemaVersion` on every design document.** Public share links must survive schema changes. A customer's WhatsApp link rendering wrong is a lost sale.
- **Zod is the single source of truth for types.** Define the design doc once, infer TS types from it, validate every API payload. Malformed input on a public endpoint is guaranteed.
- **Dimensions are validated against the allowed step grid.** Reject off-grid values server-side. See [Dimensions are stepped, not continuous](#dimensions-are-stepped-not-continuous).
- **The catalogue lives in the repo, not the database.** Dimension steps, bay widths, finishes, accessories, RM/ft rates go in `lib/wardrobe/catalogue.ts` as typed constants. They change a few times a year, they must be readable by the pure functions anyway, and this keeps database operations near zero (we bill per operation). Price changes ship as a git commit, which also gives a free audit trail of what any given quote was priced against.

## 3D

**Nothing in the scene is an image or a loaded model.** All geometry is generated procedurally from the design document. A carcass is six boxes, a shelf is a box, a rail is a thin cylinder, a drawer front is a box. There is no GLB pipeline and no 3D artist.

Do not introduce draggable sprites or imported cabinet models. That breaks parametric resizing and kills the path to a BOM.

### SketchUp files are design intake, not runtime assets

Infinite Cabinet designs in SketchUp (`.skp`) and asked to "upload SketchUp designs." This is a confirmed requirement, and it is tempting to satisfy it by converting `.skp` → GLB and loading it into the scene. **Do not do this.** A baked mesh:

- cannot resize to the customer's discrete dimension steps without ugly non-uniform stretching (panel thickness, hinges, and edges all distort);
- carries no parameters, so it can never produce a price or a BOM;
- is heavy web geometry that fights the mobile performance budget below.

Instead, a SketchUp file is a **reference for design intent**, not a thing the browser ever loads. The intake flow is:

```
Infinite Cabinet's .skp design
        ↓  (JNS reads it: module layout, panel config, finishes, dimension steps)
  New entry in catalogue.ts  (typed parameters)
        ↓
  Procedural engine generates the resizable model in-browser
```

Onboarding a new design is therefore a **data-entry task, not a 3D-modeling task**. That is the whole point: it is what lets one person maintain the catalogue and what lets the product scale to other cabinet makers later. The SketchUp file tells us *what to build*; our code builds the resizable version.

When pitching this to the client, frame it as *"your design drives a smart, resizable configurator,"* not *"we render your file."* It's a better product and they should hear why. If they later need self-service SketchUp upload (parsing `.skp` to auto-suggest catalogue parameters), that is a much later, optional automation — never the runtime rendering path.

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
| Bay-picker thumbnails | `/public` | Pre-rendered headlessly from the same procedural code, committed as PNGs. Never boot a WebGL context per thumbnail. |
| SketchUp reference files | Not in the app | Design-intake source material for the JNS team. Keep in the client's own store / a shared drive. Never loaded at runtime, never in `/public`, never in Blob. |
| Canvas screenshots | Vercel Blob | User-generated at runtime, one per lead |
| Quote PDFs | Vercel Blob | Same |
| Design JSON, leads, Blob URLs | Postgres | |

Test: if you could delete it and rebuild it from a `git clone`, it belongs in the repo, not Blob.

**Never base64 images into a Postgres column.** Storage is currently 0.01 of 10 GiB across the whole workspace; this is the one thing that would realistically blow it.

## UX flow

Five steps, each with a sensible default so an impatient user can hit Next four times and still land on something that looks good in 3D. Blank canvases kill conversion.

1. Measure your space
2. Suggested bay split (editable)
3. Fit out each bay
4. Doors and finish
5. Price + request quote

**No login to configure.** Design autosaves to `localStorage`. The email/WhatsApp gate sits at **"save & share"**, not at entry — by then the customer has sunk time into a design and will trade a phone number to keep it.

Save writes the design to Postgres under a `nanoid` slug, returns a short URL, creates the lead record, and attaches the screenshot. Then a `wa.me` deep link with the design URL prefilled.

Ship 8–10 **preset designs** as their own indexable routes ("2.4m 3-door sliding wardrobe", etc). Each is an SEO landing page and an entry point into the configurator — solves the blank-canvas problem and the traffic problem together.

## Auth

None for the public configurator. Auth.js or Better Auth only for the admin inbox where Infinite Cabinet's sales staff read incoming leads. A handful of accounts, nothing elaborate.

## Relationship to Factory Tracker

Separate repository, deliberately. Factory Tracker is an authenticated B2B dashboard where bundle size barely matters; this is a public marketing surface where three.js weight decides whether the lead ever loads the page. Different audiences, deploy cadences, and risk profiles. A configurator hotfix must not redeploy a system the factory floor depends on.

Phase 4 integration is a **versioned HTTP contract**, not a monorepo. Factory Tracker exposes `POST /api/v1/production-orders`; the configurator calls it with a signed payload. Extract a shared types package only if that becomes painful.

Separate Prisma Postgres database from Factory Tracker, same plan.

## Phasing

| Phase | Work |
| --- | --- |
| 0 | Catalogue + pricing spec workshop with client, including SketchUp design-intake process (what parameters we extract, how designs are handed over) |
| 1 | Design schema, rules (incl. dimension-step validation), server pricing — headless, tested against JSON fixtures |
| 2 | Stepper UI + 3D viewer |
| 3 | Lead capture, share links, admin inbox |
| 4 | Approved quote → BOM → production job in Factory Tracker |

Do not start Phase 2 before Phase 1 passes its tests. The engine is the product; the UI is a skin over it.

Automated `.skp` parsing (self-service upload that auto-suggests catalogue parameters) is **out of scope for Phases 0–4.** It is an optional later automation on top of a working manual intake, never a prerequisite. Do not let it block the launch.

## Open questions — resolve before writing pricing.ts

- **How does Infinite Cabinet actually price wardrobes?** Malaysian cabinet makers typically quote per foot run (RM/ft) with adders for finishes and accessories, rather than per-module BOM. If so, `pricing.ts` is trivial. Confirm before building.
- **Does the public tool show a firm price or an indicative range?** Sales teams often resist public exact pricing. This is a business decision and it changes the UI.
- **The exact allowed dimension steps.** Confirm the real grid (e.g. 300–900 mm and the increments) per dimension — width, height, depth — from their standard modules. These become the constants in `catalogue.ts`.
- **Their real module standard**: carcass widths, heights, depths, door types, finishes, accessory range.
- **SketchUp design-intake process.** What information do we read out of a `.skp` file to author a catalogue entry, in what form does the client hand designs over, and how often do new designs arrive? This determines whether manual intake is sustainable and what (if anything) is worth automating later.
- Does Prisma Postgres offer an ap-southeast region? If not, quote submission eats a transpacific round trip.

## Conventions

- Sentence case in UI copy. Prices in RM.
- Every `lib/wardrobe` function gets a test with a JSON fixture before it gets a caller.
- Commit the catalogue changes separately from code changes so price history is greppable.
