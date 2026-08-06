# Wardrobe configurator

Lead-generation wardrobe planner for **Infinite Cabinet Sdn Bhd**, built by JNS Nexion Enterprise.

A customer measures their space, designs a wardrobe in 3D, sees a price, and requests a quote. Reference product is IKEA's PAX planner — wardrobes only, against one wall.

This is a marketing surface, not a manufacturing tool. A human validates every design before it becomes an order.

See [CLAUDE.md](./CLAUDE.md) for architecture, conventions, and the full phase plan. This file only covers getting it running.

## Status

Proof of concept.

| Phase | Scope | State |
|---|---|---|
| 0 | Catalogue + pricing spec with client | **Not started** |
| 1 | Design schema, rules, pricing | Done, tested |
| 2 | Stepper UI + 3D viewer | Viewer done; 5-step stepper not built |
| 3 | Lead capture, share links, admin inbox | Not started |
| 4 | Quote → BOM → Factory Tracker | Not started |

> **Prices shown are not real.** Phase 0 hasn't happened, so every value in
> `src/lib/wardrobe/catalogue.ts` is a placeholder chosen to exercise the engine.
> No quote from these numbers is valid until Infinite Cabinet confirms their rates.

## Getting started

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

- `/viewer` — the working demo: cutaway room, procedural wardrobe, preset catalogue, live price.
- `/` — still the default Next.js landing page. The real landing page is Phase 3.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm test` | Vitest, engine tests only |
| `pnpm lint` | Biome check (lint + format) |
| `pnpm generate:grain` | Regenerates `public/textures/grain-1k.png` |

`generate:grain` is a one-off — the PNG is committed. Only rerun it if you change the generator.

## Layout

```
src/
  lib/wardrobe/        Pure TypeScript engine. No React, no three.js.
    schema.ts          Zod design document; TS types inferred from it
    catalogue.ts       Widths, finishes, accessories, RM/ft rates (placeholders)
    rules.ts           Bay splitting and validation
    pricing.ts         (design) => itemised price breakdown
    presets.ts         buildDesign() + the six starter designs
    room.ts            The customer's space
    bom.ts             Phase 4 stub
  components/viewer/   React Three Fiber scene
  app/viewer/          Demo page
```

`lib/wardrobe` must stay framework-free. If a change there needs React or three.js, the change is in the wrong place.

## Rules worth knowing before you edit

- **The design document is the only source of truth.** Geometry, price, and eventually the cutting list are all derived from it. Nothing is stored twice.
- **Price is authoritative server-side.** The client figure is indicative; never trust a client-submitted price.
- **All 3D geometry is procedural.** A carcass is five boxes, a rail is a cylinder. No imported models — they break parametric resizing and the path to a BOM.
- **The catalogue lives in the repo, not the database**, and ships as its own commit so price history stays greppable.
- **Target device is a mid-range Android on Malaysian mobile data.** One 1K greyscale grain texture tinted per finish, no real-time shadows, 3D bundle lazy-loaded behind `Suspense`.

## Testing

```bash
pnpm test
```

Covers the engine against JSON fixtures in `src/lib/wardrobe/__tests__/`. Per CLAUDE.md, every `lib/wardrobe` function gets a fixture test before it gets a caller. There are no UI tests yet.
