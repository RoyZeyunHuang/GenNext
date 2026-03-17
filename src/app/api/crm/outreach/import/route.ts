import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).toLowerCase().trim();
    out[key] = v != null ? String(v).trim() : "";
  }
  return out;
}

function mapProgressToStage(progress: string): string {
  const s = progress.trim();
  if (s === "Pitch Sent") return "Pitched";
  if (s === "First Meeting") return "Meeting";
  if (s === "Contract Signed") return "Won";
  return s || "Not Started";
}

function mapStatusToDealStage(
  status: string
): { deal_status: string; stage?: string; lost_reason?: string } {
  const s = status.trim();
  if (s === "In Progress") return { deal_status: "Active" };
  if (s === "Need Follow Up") return { deal_status: "Need Follow Up" };
  if (s === "Dropped") return { deal_status: "Active", stage: "Lost", lost_reason: "Other" };
  if (s === "Signed w/ Others") return { deal_status: "Active", stage: "Lost", lost_reason: "Signed w/ Others" };
  return { deal_status: s || "Active" };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return Response.json({ error: "请上传 Excel 文件" }, { status: 400 });
    }
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return Response.json({ error: "Excel 无有效工作表" }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
    if (rows.length === 0) {
      return Response.json({ imported: 0, newProperties: 0, newCompanies: 0 });
    }

    let newProperties = 0;
    let newCompanies = 0;

    for (const row of rows) {
      const r = normalizeRow(row);
      const propertyName = r.property ?? r["property name"] ?? "";
      if (!propertyName) continue;

      const developerName = r.developer ?? "";
      const progress = r.progress ?? "";
      const status = r.status ?? "";
      const price = r.price ?? "";
      const term = r.term ?? "";

      const stageMapped = mapProgressToStage(progress);
      const statusMapped = mapStatusToDealStage(status);
      const stage = statusMapped.stage ?? stageMapped;
      const deal_status = statusMapped.deal_status;
      const lost_reason = statusMapped.lost_reason ?? null;

      let propertyId: string;

      const { data: existingProp } = await supabase
        .from("properties")
        .select("id")
        .ilike("name", propertyName)
        .limit(1)
        .maybeSingle();

      if (existingProp?.id) {
        propertyId = existingProp.id;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from("properties")
          .insert({ name: propertyName })
          .select("id")
          .single();
        if (insertErr) continue;
        propertyId = inserted.id;
        newProperties++;
      }

      if (developerName) {
        const { data: existingCo } = await supabase
          .from("companies")
          .select("id")
          .ilike("name", developerName)
          .limit(1)
          .maybeSingle();

        let companyId: string;
        if (existingCo?.id) {
          companyId = existingCo.id;
        } else {
          const { data: insertedCo, error: coErr } = await supabase
            .from("companies")
            .insert({ name: developerName, type: "developer" })
            .select("id")
            .single();
          if (coErr) continue;
          companyId = insertedCo.id;
          newCompanies++;
        }

        const { data: existingLink } = await supabase
          .from("property_companies")
          .select("id")
          .eq("property_id", propertyId)
          .eq("company_id", companyId)
          .eq("role", "developer")
          .limit(1)
          .maybeSingle();

        if (!existingLink?.id) {
          await supabase.from("property_companies").insert({
            property_id: propertyId,
            company_id: companyId,
            role: "developer",
          });
        }
      }

      const { data: existingOutreach } = await supabase
        .from("outreach")
        .select("id")
        .eq("property_id", propertyId)
        .limit(1)
        .maybeSingle();

      const payload = {
        stage,
        deal_status,
        price: price || null,
        term: term || null,
        lost_reason,
        updated_at: new Date().toISOString(),
      };

      if (existingOutreach?.id) {
        await supabase.from("outreach").update(payload).eq("id", existingOutreach.id);
      } else {
        await supabase.from("outreach").insert({
          property_id: propertyId,
          stage,
          deal_status,
          price: price || null,
          term: term || null,
          lost_reason,
        });
      }
    }

    return Response.json({
      imported: rows.length,
      newProperties,
      newCompanies,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "导入失败";
    return Response.json({ error: msg }, { status: 500 });
  }
}
