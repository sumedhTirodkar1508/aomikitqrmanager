# QR Token Lifecycle

A `QRToken` moves through a small state machine. `ACTIVATED`, `VOIDED`, and
`REPLACED` are terminal states with no outgoing transitions.

## State diagram

```
                generate / import
                       │
                       ▼
                 ┌───────────┐
                 │ AVAILABLE │
                 └───────────┘
                   │       │
       seller      │       │ admin void
       assign      │       │
                   ▼       ▼
            ┌──────────┐  ┌────────┐
            │ ASSIGNED │  │ VOIDED │  (terminal)
            └──────────┘  └────────┘
              │   │   │
   mobile     │   │   │ admin void
   activate   │   │   └──────────────► VOIDED (terminal)
              │   │
              │   │ replace
              │   └────────────► REPLACED (terminal)
              ▼
        ┌───────────┐
        │ ACTIVATED │  (terminal)
        └───────────┘
```

## Transitions

| From | To | Trigger | Guard |
| --- | --- | --- | --- |
| AVAILABLE | ASSIGNED | Seller assignment (`/seller/assign`) | `updateMany where status = AVAILABLE` |
| AVAILABLE | VOIDED | Admin void | `updateMany where status in (AVAILABLE, ASSIGNED)` |
| ASSIGNED | ACTIVATED | Mobile `POST /api/qr/activate` | `updateMany where status = ASSIGNED` |
| ASSIGNED | VOIDED | Admin void | `updateMany where status in (AVAILABLE, ASSIGNED)` |
| ASSIGNED | REPLACED | Replacement (schema-supported, no UI yet) | — |

Any transition whose guard matches zero rows (`count === 0`) is rejected — this
is how concurrent assignment/activation races are prevented.

## State meanings

- **AVAILABLE** — generated or imported, not yet used. Eligible for assignment.
- **ASSIGNED** — a seller created a `Package` (immutable product snapshot) and
  bound it to this token. `assignedAt` is set.
- **ACTIVATED** — the end customer scanned/activated via the mobile app.
  `activatedAt` is set; the linked `Package` is also `ACTIVATED`. Terminal.
- **VOIDED** — administratively retired before activation. `voidedAt` is set.
  Terminal.
- **REPLACED** — superseded by a replacement token (`replacedByTokenId`).
  Terminal.

## Race safety

All status changes use `prisma.qRToken.updateMany({ where: { id, status }, … })`
inside a transaction and reject when the affected count is `0`. The assignment
flow additionally creates the `Package` and `PackageProduct` snapshot rows in
the same transaction, so a token is never left half-assigned.

## Package synchronization

When a token is **voided**, the linked `Package.status` is also set to `VOIDED`
in the same transaction. When a token is **activated**, `Package.status` is set
to `ACTIVATED` in the same transaction. Package status always mirrors token
status for completed transitions.
