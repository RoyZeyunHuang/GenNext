import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getRfSession } from "@/lib/rf-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isTeamMember, recordTeamContribution } from "@/lib/team-membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — copy a personal doc into a team (creates a new doc with team_id set) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getRfSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const teamId = typeof body.team_id === "string" ? body.team_id.trim() : "";
  if (!teamId) return NextResponse.json({ error: "team_id 必填" }, { status: 400 });

  // Check team membership
  const { isMember } = await isTeamMember(teamId, session.userId);
  if (!isMember) return NextResponse.json({ error: "你不是该团队成员" }, { status: 403 });

  // Fetch original doc
  const { data: doc, error: fe } = await supabase
    .from("docs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: "文档不存在" }, { status: 404 });

  // Ensure caller owns the doc or it's public
  const ownerId = doc.owner_id as string | null;
  if (ownerId !== null && ownerId !== session.userId && !session.isAdmin) {
    return NextResponse.json({ error: "只能分享自己的文档" }, { status: 403 });
  }

  // Need a team category — find or create a default one for the team
  const admin = getSupabaseAdmin();
  let teamCategoryId: string;

  // Try to find existing category with same name in the team
  const originalCategoryId = doc.category_id as string | null;
  let catName = "素材库";
  if (originalCategoryId) {
    const { data: origCat } = await supabase
      .from("doc_categories")
      .select("name")
      .eq("id", originalCategoryId)
      .maybeSingle();
    if (origCat?.name) catName = origCat.name as string;
  }

  const { data: existingCat } = await supabase
    .from("doc_categories")
    .select("id")
    .eq("team_id", teamId)
    .eq("name", catName)
    .maybeSingle();

  if (existingCat) {
    teamCategoryId = existingCat.id as string;
  } else {
    const { data: newCat, error: ce } = await admin
      .from("doc_categories")
      .insert({ name: catName, team_id: teamId, owner_id: null })
      .select("id")
      .single();
    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
    teamCategoryId = newCat.id as string;
  }

  // Create a copy of the doc under the team
  const { data: newDoc, error: de } = await admin
    .from("docs")
    .insert({
      category_id: teamCategoryId,
      title: doc.title,
      content: doc.content,
      tags: doc.tags,
      metadata: doc.metadata,
      owner_id: session.userId,
      team_id: teamId,
    })
    .select()
    .single();

  if (de) return NextResponse.json({ error: de.message }, { status: 500 });

  // Record contribution
  recordTeamContribution(teamId, session.userId, "doc_share", 2, newDoc.id as string);

  return NextResponse.json(newDoc);
}
