// app/api/test/invite/route.ts
import { NextResponse } from "next/server";
import { generateInviteLink } from "@/lib/telegram/invite";

export async function GET() {
  try {
    const result = await generateInviteLink({
      memberLimit: 1,
      expireHours: 48,
      name: `Test-${Date.now()}`,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}