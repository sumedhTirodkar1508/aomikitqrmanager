import { NextResponse } from "next/server";
import { QRTokenStatus } from "@/generated/prisma/client";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function resolveActivationRace(
  fresh: { token: string; status: QRTokenStatus; activatedAt: Date | null } | null
) {
  if (!fresh) {
    return NextResponse.json(
      { error: "Token not found" },
      { status: 404, headers: NO_STORE }
    );
  }

  if (fresh.status === "ACTIVATED") {
    return NextResponse.json(
      {
        token: fresh.token,
        status: fresh.status,
        activatedAt: fresh.activatedAt,
        message: "Token already activated",
      },
      { headers: NO_STORE }
    );
  }

  return NextResponse.json(
    {
      token: fresh.token,
      status: fresh.status,
      error: `Token cannot be activated from status ${fresh.status}`,
    },
    { status: 409, headers: NO_STORE }
  );
}
