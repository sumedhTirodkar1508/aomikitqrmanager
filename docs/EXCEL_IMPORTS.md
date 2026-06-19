# Excel Imports

Each admin catalog page has its own Excel template and its own import flow.
There is **no** combined catalog workbook — products, diagnoses, routine types,
and routines are imported independently.

## Where

| Page | Header actions | Template file |
| --- | --- | --- |
| `/admin/products` | Import from Excel · Download Products Template | `AOMI_PRODUCTS_TEMPLATE_V1.xlsx` |
| `/admin/diagnoses` | Import from Excel · Download Diagnoses Template | `AOMI_DIAGNOSES_TEMPLATE_V1.xlsx` |
| `/admin/routine-types` | Import from Excel · Download Routine Types Template | `AOMI_ROUTINE_TYPES_TEMPLATE_V1.xlsx` |
| `/admin/routines` | Import from Excel · Download Routines Template | `AOMI_ROUTINES_TEMPLATE_V1.xlsx` |

Templates are generated on demand (ADMIN-only) at
`GET /api/admin/templates/{products|diagnoses|routine-types|routines}`.

## Shared import flow

Every importer uses the same dialog (`ExcelImportDialog`) and the same
two-phase contract:

1. **Choose file** — `.xlsx` only, **10 MB** maximum, **5000** data rows maximum.
2. **Preview (dry run)** — parses and validates with **zero database writes**.
   Shows total rows, records to create, existing records to skip, invalid
   records, and an error table (sheet · row · field · message). A CSV error
   report can be downloaded (formula-injection-escaped).
3. **Confirm import** — re-parses and re-validates the same file immediately
   before writing, then creates only the valid, new rows in **one transaction**
   with a **single audit log entry**. A failure rolls back everything.
4. **Import another** — reset and repeat.

Status labels are consistent across all importers:

```
CREATE         valid + new → will be inserted
SKIP_EXISTING  business identifier already in the database → never overwritten
ERROR          invalid row (validation, duplicate-in-file, formula, bad reference)
```

Accounting invariant (per importer): `totalRows = CREATE + SKIP_EXISTING + ERROR`.

## Security

- Upload capped at 10 MB and 5000 rows; non-`.xlsx` rejected.
- Formula cells are rejected where plain data is expected.
- Generated templates and downloaded error reports escape values that could be
  interpreted as formulas (CSV/formula injection defense — see
  `src/lib/spreadsheet-safe.ts`).
- All import Server Actions and template routes require `ADMIN`.
- The workbook is revalidated immediately before the confirmed write; the
  client preview is never trusted.
- Internal database IDs are never written into templates or error reports.

## Template A — Products (`AOMI_PRODUCTS_TEMPLATE_V1.xlsx`)

Sheets: `Instructions`, `Products`, `Lookups`.

`Products` columns: `sku`, `name`, `stepType`, `category`,
`functionDescription`, `isActive`.

- `sku` is the stable business identifier; required and unique within the file.
- `stepType` must be one of the allowed values (Lookups sheet / dropdown).
- `isActive` accepts TRUE/FALSE (defaults TRUE).
- Existing SKUs are `SKIP_EXISTING`. Images and replacement rules are **not**
  imported by this template.

## Template B — Diagnoses (`AOMI_DIAGNOSES_TEMPLATE_V1.xlsx`)

Sheets: `Instructions`, `Diagnoses`.

`Diagnoses` columns: `slug`, `name`, `description`, `isActive`.

- `slug` is the stable identifier; normalized with the app convention
  (`toSlug`), required, unique within the file.
- Existing slugs are `SKIP_EXISTING`.

## Template C — Routine Types (`AOMI_ROUTINE_TYPES_TEMPLATE_V1.xlsx`)

Sheets: `Instructions`, `Routine Types`.

`Routine Types` columns: `slug`, `name`, `isActive`.

- Same slug rules as diagnoses. (Legacy templates containing a `description` column are safely parsed but the unused column is ignored.)

## Template D — Routines (`AOMI_ROUTINES_TEMPLATE_V1.xlsx`)

Sheets: `Instructions`, `Routines`, `Routine Diagnoses`, `Routine Steps`,
`Lookups`. The `Lookups` sheet is populated from the live active catalog and
drives dropdowns.

`Routines`: `routineKey`, `name`, `routineTypeSlug`, `durationDays`,
`description`, `generalInstructions`, `isActive`.
`Routine Diagnoses`: `routineKey`, `diagnosisSlug`.
`Routine Steps`: `routineKey`, `stepNumber`, `stepType`, `defaultProductSku`,
`instruction`.

`routineKey` is a **workbook-local** handle joining the three sheets — it is not
a database id.

Relationship validation:

- `routineKey` unique within the workbook; child rows must reference a known key.
- `routineTypeSlug` must reference an existing **active** routine type.
- `diagnosisSlug` must reference an existing **active** diagnosis; duplicate
  routine/diagnosis pairs are rejected.
- `defaultProductSku` (optional) must reference an existing **active** product,
  and the product's `stepType` must equal the step's `stepType`.
- `stepNumber` must be a positive integer, unique within a routine; every
  routine needs at least one step.
- Existing routine names are `SKIP_EXISTING` (never overwritten).
- The entire confirmed import runs in one transaction; a failure leaves no
  partial routines, steps, or diagnosis links, and writes no audit entry.

## Dependency

Reading and generating XLSX uses [`exceljs`](https://www.npmjs.com/package/exceljs)
(MIT). SheetJS (`xlsx`) is intentionally **not** used — it was removed from the
npm registry and has had prototype-pollution/ReDoS advisories. See the project
report for the full assessment.

## Code map

| Concern | File |
| --- | --- |
| Core parsing, cell coercion, formula rejection, types | `src/lib/server/excel/core.ts` |
| Products importer | `src/lib/server/excel/products.ts` |
| Slug-entity (diagnoses/routine types) parser | `src/lib/server/excel/slug-entity.ts` |
| Diagnoses / routine-types importers | `src/lib/server/excel/diagnoses.ts`, `routine-types.ts` |
| Routines importer | `src/lib/server/excel/routines.ts` |
| Template generators | `src/lib/server/excel/templates.ts` |
| Formula-injection escape (shared) | `src/lib/spreadsheet-safe.ts` |
| Upload bounds + action state | `src/lib/server/excel/action-helpers.ts` |
| Page-specific Server Actions | `src/app/(admin)/admin/<entity>/import-actions.ts` |
| Template download route | `src/app/api/admin/templates/[entity]/route.ts` |
| Import dialog UI | `src/components/admin/excel-import-dialog.tsx` |

Tests: `npm run test:excel-import`.
