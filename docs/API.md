# Mobile REST API

Endpoints consumed by the AOMI mobile app. All requests must include the shared
secret header.

## Current Implementation Status

The currently implemented REST API surface is strictly limited to the following endpoints required for Phase 1 mobile integration and internal functionality:

- `GET /api/qr/[token]`
- `POST /api/qr/activate`
- `GET /api/admin/qr-tokens/export`
- `GET /api/admin/templates/[entity]`
- `POST /api/internal/keepalive`
- Auth.js handler under `/api/auth/[...nextauth]`

**Important Note on Unbuilt Endpoints:**
The following planned endpoints are **intentionally not implemented** as REST APIs because the web application uses Next.js Server Components, Server Actions, and Prisma for direct data access:
- `GET /api/routines`
- `GET /api/products`
- `POST /api/qr/assign`

Do not build these old planned endpoints unless the mobile team explicitly requires them.

## Authentication

```
x-api-key: <MOBILE_API_KEY>
```

Missing or incorrect key → `401 Unauthorized`. If `MOBILE_API_KEY` is not set
on the server → `503`. Key comparison is timing-safe (`crypto.timingSafeEqual`).

All responses include `Cache-Control: no-store`.

Generated AOMI tokens use `PREFIX-XXXXXX`, with a six-character
cryptographically secure suffix from an unambiguous uppercase alphabet.
Existing and CSV-imported token values remain valid even when they use another
previously accepted prefix or length.

---

## GET `/api/qr/{token}`

Look up a token and, when assigned/activated, return its full package payload.

### Responses by status

**AVAILABLE**
```json
{
  "token": "AOMI-KIT-7F3K9Q",
  "status": "AVAILABLE",
  "message": "Token not yet assigned"
}
```

**VOIDED / REPLACED**
```json
{
  "token": "AOMI-KIT-7F3K9Q",
  "status": "VOIDED",
  "message": "This token has been voided"
}
```

**ASSIGNED / ACTIVATED**
```json
{
  "token": "AOMI-KIT-7F3K9Q",
  "status": "ASSIGNED",
  "assignedAt": "2026-06-12T10:00:00.000Z",
  "activatedAt": null,
  "package": { "id": "pkg_abc", "status": "ASSIGNED" },
  "routine": {
    "id": "rt_abc",
    "name": "Acne Recovery — Basic",
    "description": "…",
    "durationDays": 30,
    "generalInstructions": "Apply morning and night.",
    "routineType": {
      "id": "rtyp_123",
      "name": "Acne Protocol",
      "slug": "acne-protocol"
    },
    "diagnoses": [
      {
        "id": "diag_123",
        "name": "Hormonal Acne",
        "slug": "hormonal-acne"
      }
    ]
  },
  "steps": [
    {
      "stepNumber": 1,
      "stepType": "CLEANSER",
      "instruction": "Massage onto damp skin.",
      "isReplacement": false,
      "product": {
        "id": "prod_abc",
        "name": "Gentle Foaming Cleanser",
        "sku": "AOMI-CLN-001",
        "category": "Cleanser",
        "functionDescription": "…",
        "imageUrl": "https://…/product-images/prod_abc/front.jpg",
        "primaryImageUrl": "https://…/product-images/prod_abc/front.jpg"
      }
    }
  ]
}
```

`imageUrl` and `primaryImageUrl` both point to the product's primary image (lowest
`sortOrder`), or `null` if no image exists. Both fields are present
for backward compatibility; prefer `primaryImageUrl` in new client code.

Note: `routineType` and `diagnoses` fields were added in a later update. Older
clients that do not expect these fields can safely ignore them.

### Errors
- `404` — token not found
- `401` — bad/missing `x-api-key`

### Example
```bash
curl -H "x-api-key: $MOBILE_API_KEY" \
  https://your-app.vercel.app/api/qr/AOMI-KIT-7F3K9Q
```

---

## POST `/api/qr/activate`

Transition an `ASSIGNED` token to `ACTIVATED`. Idempotent: re-activating an
already `ACTIVATED` token returns success without side effects.

### Request body
```json
{
  "token": "AOMI-KIT-7F3K9Q",
  "externalUserId": "mobile-user-123"
}
```
For compatibility with standard snake_case HTTP payloads, the server also accepts
`qr_token` and `external_user_id` as aliases:
```json
{
  "qr_token": "AOMI-KIT-7F3K9Q",
  "external_user_id": "mobile-user-123"
}
```

`externalUserId` (or `external_user_id`) is optional. `token` (or `qr_token`) is
trimmed and capped at 500 characters. User IDs are trimmed and capped at 200 characters.

### Success
```json
{
  "token": "AOMI-KIT-7F3K9Q",
  "status": "ACTIVATED",
  "activatedAt": "2026-06-12T11:00:00.000Z",
  "message": "Token activated"
}
```

Already activated → same shape with `"message": "Token already activated"`.

### Errors
- `400` — invalid JSON or missing `token`
- `404` — token not found
- `409` — token is in a state that cannot be activated (e.g. AVAILABLE, VOIDED,
  REPLACED)
- `401` — bad/missing `x-api-key`

### Side effects
On a successful activation the server:
- sets `QRToken.status = ACTIVATED` (race-safe `updateMany` guard)
- sets the linked `Package.status = ACTIVATED`
- creates an `ActivationEvent`
- writes an `AuditLog` entry

### Example
```bash
curl -X POST \
  -H "x-api-key: $MOBILE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"token":"AOMI-KIT-7F3K9Q","externalUserId":"u-123"}' \
  https://your-app.vercel.app/api/qr/activate
```
