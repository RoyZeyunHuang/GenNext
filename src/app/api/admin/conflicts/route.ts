import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFLICTS_FILENAME = "conflicts.json";

function conflictsPath() {
  return path.join(process.cwd(), CONFLICTS_FILENAME);
}

export async function GET() {
  try {
    const raw = await fs.readFile(conflictsPath(), "utf8");
    const data = JSON.parse(raw) as unknown;
    return NextResponse.json(data);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return NextResponse.json({ properties: [], contacts: [] });
    }
    console.error("[admin/conflicts] GET", e);
    return NextResponse.json(
      { error: err.message || "读取 conflicts.json 失败" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
    }
    const { properties, contacts } = body as {
      properties?: unknown;
      contacts?: unknown;
    };
    if (!Array.isArray(properties) || !Array.isArray(contacts)) {
      return NextResponse.json(
        { error: "body 需包含 properties、contacts 数组" },
        { status: 400 }
      );
    }
    const text = JSON.stringify(body, null, 2);
    await fs.writeFile(conflictsPath(), text, "utf8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    console.error("[admin/conflicts] PUT", e);
    return NextResponse.json(
      { error: err.message || "写入 conflicts.json 失败" },
      { status: 500 }
    );
  }
}
