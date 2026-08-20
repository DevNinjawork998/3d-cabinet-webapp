# Cabinet planner

Lead-generation cabinet planner for **Infinite Cabinet Sdn Bhd**, built by JNS Nexion Enterprise.

A customer picks a room, arranges cabinets against one wall in 3D, sees a price, and requests a quote. Reference product is IKEA's PAX planner — one wall, one room at a time.

This is a marketing surface, not a manufacturing tool. A human validates every design before it becomes an order.

See [CLAUDE.md](./CLAUDE.md) for architecture, conventions, and the full phase plan. This file only covers getting it running.

## Status

Proof of concept.

| Phase | Scope | State |
|---|---|---|
| 0 | Catalogue + pricing spec with client | **Not started** |
| 1 | Layout engine, rules, pricing | Done, tested |
| 2 | Planner UI + 3D scene | Done |
| 3 | Lead capture, share links, admin inbox | Admin catalogue + designs done; lead capture not started |
| 4 | Quote → BOM → Factory Tracker | Not started |

> **Prices shown are not real.** Phase 0 hasn't happened, so every figure in
> `src/lib/planner/catalogue.ts` is a placeholder chosen to exercise the engine.
> No quote from these numbers is valid until Infinite Cabinet confirms their rates.
>
> Kitchen *dimensions* are real — read out of the client's own Mozaik export by
> `lib/skp`. Every other room's dimensions are invented.

## Getting started

Requires Node 20+, pnpm, and Docker for the local database.

```bash
pnpm install
pnpm db:up          # local Postgres
pnpm db:migrate     # apply migrations
pnpm db:seed        # publish catalogue v1 from lib/planner/catalogue.ts
pnpm dev
```

Routes:

- `/` — landing page, prices its hero figure off the live published catalogue.
- `/planner` — the planner. `?room=kitchen|living|bedroom|foyer`.
- `/designs` — public gallery of published cabinet designs.
- `/admin/cabinet-designs`, `/admin/catalogue`, `/admin/import` — the admin
  surface. Shared-secret login at `/admin/login`; set `ADMIN_PASSWORD`. There is
  no `/admin` index.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm test` | Vitest, engine tests only |
| `pnpm lint` | Biome check (lint + format) |
| `pnpm db:up` / `db:down` | Local Postgres via docker compose |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:seed` | Seed the published catalogue |
| `pnpm db:studio` | Prisma Studio |
| `pnpm generate:grain` | Regenerates `public/textures/grain-1k.png` |

`generate:grain` is a one-off — the PNG is committed. Only rerun it if you change the generator.

## Layout

```
src/
  lib/planner/         Pure TypeScript engine. No React, no three.js.
    catalogue.ts       Families, sizes, doors, finishes, rates (prices are placeholders)
    catalogueSchema.ts Zod schema for a published catalogue
    layout.ts          Placement, collision, snapping, starter layouts
    pricing.ts         (layout, catalogue) => itemised price
    measure.ts         The in-scene measuring tool
  lib/catalogue/       DB-backed catalogue: read path, versions, diffs, blob storage
  lib/skp/             Reads a SketchUp job file into a draft catalogue
  components/planner/  React Three Fiber scene and the planner screens
  app/planner/         The planner route
  app/admin/           Catalogue editor, cabinet designs, .skp import
```

`lib/planner` must stay framework-free. If a change there needs React or three.js, the change is in the wrong place.

## Rules worth knowing before you edit

- **The layout document is the only source of truth.** Geometry, price, and eventually the cutting list are all derived from it. Nothing is stored twice.
- **Price is authoritative server-side.** The client figure is indicative; never trust a client-submitted price. `pricing.ts` takes its catalogue as an argument for exactly this reason — it never reads the live module palette.
- **All 3D geometry is procedural.** A carcass is six boxes, a rail is a cylinder. No imported models — they break parametric resizing and the path to a BOM.
- **The catalogue lives in the database, seeded from the repo.** `lib/planner/catalogue.ts` is the seed and the disaster-recovery copy; the live values come from the published `CatalogueVersion` row. Catalogue changes still ship as their own commit so price history stays greppable.
- **Target device is a mid-range Android on Malaysian mobile data.** One 1K greyscale grain texture tinted per finish, no real-time shadows, 3D bundle lazy-loaded behind `Suspense`.

## Testing

```bash
pnpm test
```

Covers the engine — layout, pricing, measuring, catalogue diffs, and `.skp` extraction — against fixtures in `src/lib/*/__tests__/`. Per CLAUDE.md, every `lib/planner` function gets a test before it gets a caller. There are no UI tests yet.
