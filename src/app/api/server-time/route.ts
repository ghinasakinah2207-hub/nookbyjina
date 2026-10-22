import { NextResponse } from "next/server";

export async function GET() {
  const now = new Date();
  return NextResponse.json(
    {
      serverTime: now.toISOString(),
      timestamp: now.getTime(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
