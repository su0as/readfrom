/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getEntitlement, isEntitled } from "@/utils/entitlements";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const emailQ = searchParams.get("email");
    const email = emailQ || req.cookies.get("rf_email")?.value || null;
    if (!email) return NextResponse.json({ entitled: false });
    const entitled = await isEntitled(email);
    const ent = await getEntitlement(email);
    return NextResponse.json({ email, entitled, entitlement: ent || undefined });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
