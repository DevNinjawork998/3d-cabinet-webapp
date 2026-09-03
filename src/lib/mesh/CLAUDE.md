# Design intake (`lib/mesh`)

How an OBJ export becomes catalogue data and a drawable mesh. Loaded only when
working under `src/lib/mesh/` — the rules that govern what the *planner* does
with the result stay in the root `CLAUDE.md` under "3D".

## Every stage infers, none assumes

The admin keeps adding designs, so each import is a file nobody has seen. A
`.skp` gave cabinets for free — component instances *are* cabinets — but an OBJ
is one flat namespace of boxes with no units and no up-axis. So:

- **Scale** (`normalise.ts`) is found by trying mm/cm/inch/metre and keeping the
  one that puts the modal panel thickness in 12–25mm. Board thickness is a
  constant of the trade; model size is not.
- **Up-axis** is found by settling *depth first* (this product plans one wall, so
  depth is the smallest extent) and then voting between the two axes left, on
  which one panels are thin on. Voting across all three gets it wrong on a real
  file, because doors and backs are thin on depth and outvote the shelves.
- **Which end is the wall.** A *named* front wins — if the drafter typed
  `Door_L_`, that panel's side is the front, full stop. `inferFrontSide` is the
  fallback, and it deliberately ignores anything standing on the floor: feet are
  hardware by every test but a leveller sits under the middle of the carcass and
  says nothing about which way it faces. Four of them with no knobs flipped the
  client's `BC 800mm.obj` back to front.
- **Getting this wrong is now visible, not subtle.** Mirroring the depth axis
  reverses triangle winding, so the indices are emitted backwards to compensate;
  without that every normal points inward and the cabinet renders black.
- **Panel roles** (`roles.ts`) come from one ordered naming table, with a
  geometric fallback. `NAMING_RULES` is the only place cabinet semantics live; a
  drafter who renames something is an edit there and nowhere else.
- **Cabinets in a run** (`strategies.ts`) are found by three strategies,
  best-first: gaps between end panels (high confidence), connected components of
  touching panels (medium), the whole file as one row (low).

Finish names do not survive the export: materials come through as `7#752#-1`
pointing at re-encoded texture copies. The real names survive only as the texture
filenames in the folder, so the confirm step asks a human to name and colour
each one. Do not try to auto-map them.

## Two intake paths, one merge

A whole-wall export and a single-cabinet file are different problems, so there
are two front doors into the same merge.

| | `/admin/import` | `/admin/cabinet-designs` |
| --- | --- | --- |
| File | a run of cabinets | one product |
| Reader | `mesh/read.ts` → `strategies.ts` groups it | `mesh/measureDesign.ts` |
| Size | per cabinet, found between end panels | the whole file's bounding box |
| Then | confirm table → `mergeIntoCatalogue` | `POST [id]/publish` → `mergeIntoCatalogue` |

`measureDesign` deliberately skips the run-grouping. Over a lone cabinet
`byEndPanels` measures the opening *between* the end panels, so an 800 carcass
reports 768 — its clear width, minus two 16mm boards. The form wants the size on
the invoice, which is the bounding box. `coalesceParts` unions the records an
exporter split a panel into (safe here because it is one cabinet; across a run it
would merge neighbours).

Both ends land in `mergeIntoCatalogue` and both **create a DRAFT and stop**.
Publishing stays one deliberate act at `/admin/catalogue`, because that document
prices real kitchens and a bad parse must never reach a customer unreviewed. The
publish route re-fetches the bytes from Blob and re-parses them — trust comes
from the file, never from what a client claims about it.

`CabinetDesign.familyId` records which family a design merged into.
`SizeOption.meshDesignId` records which design a *rung* is drawn from — one per
width, because that is how the client draws them.

**Several files, one draft.** `publishDesigns` takes an array, so BC 600 / BC
800 / BC 900 become three rungs of one ladder in a single DRAFT rather than
three stacked drafts each based on the last. `/admin/cabinet-designs` takes
several files at once for the same reason; only SKU and price are per file,
because only SKU and price genuinely differ between widths of the same cabinet.
A file that will not parse fails on its own row and the rest of the batch still
lands.

## Imports are additive

`mergeIntoCatalogue` can create a family and it can add a rung to an existing
family's size ladder. **It cannot delete a family, remove a rung, or overwrite a
`priceRm` that already has a value.** An earlier version replaced the family list
wholesale, which meant the second import silently destroyed everything the first
one had contributed and the client had priced. A cabinet matching an existing
family's shape and fit-out — within 20mm, since 607 and 600 are the same carcass
read with and without its door — extends that family's ladder at RM 0 rather
than forking a duplicate.

`meshDesignId` is the one exception, and deliberately: a price is a decision a
human made and an import must never touch it, but a mesh id is derived cache and
re-publishing a design after fixing its file has to replace the stale one.

**`geometry` is additive one level deeper.** A family with none takes the
design's wholesale; a family that has one keeps every field that has a value and
fills only the ones that never did. That is not a nicety — when `legDiameterMm`
and `legInsetMm` were added, `base-cabinet` already carried a `geometry` learned
before they existed, so the old all-or-nothing rule would have left it guessing
a 50mm foot forever with no re-upload able to correct it.
