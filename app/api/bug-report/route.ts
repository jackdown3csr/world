import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

function trimValue(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reporter = trimValue(body?.reporter, 48);
    const walletAddress = trimValue(body?.walletAddress, 96);
    const selectedLabel = trimValue(body?.selectedLabel, 120);
    const userAgent = trimValue(body?.userAgent, 220);
    const message = trimValue(body?.message, 1400);

    if (!DISCORD_WEBHOOK_URL) {
      return NextResponse.json({ error: "Bug reporting is not configured." }, { status: 503 });
    }

    if (!message) {
      return NextResponse.json({ error: "Bug report message is required." }, { status: 400 });
    }

    const content = [
      "**Sector Galactica bug report**",
      reporter ? `reporter: ${reporter}` : "reporter: anonymous",
      walletAddress ? `wallet: ${walletAddress}` : "wallet: none",
      selectedLabel ? `context: ${selectedLabel}` : null,
      userAgent ? `ua: ${userAgent}` : null,
      "",
      message,
    ].filter(Boolean).join("\n");

    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content.slice(0, 1900),
        allowed_mentions: { parse: [] },
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Discord webhook failed: ${res.status} ${text}`.trim());
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Bug report could not be sent." }, { status: 500 });
  }
}
