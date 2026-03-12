"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function saveGeneratedCopy(params: {
  document_ids: string[];
  prompt: string;
  output: string;
  type: string;
  starred?: boolean;
}) {
  const { data } = await supabase.from("generated_copies").insert(params).select("id").single();
  revalidatePath("/copywriter");
  return data?.id ?? null;
}

export async function toggleStarred(id: string, starred: boolean) {
  await supabase.from("generated_copies").update({ starred }).eq("id", id);
  revalidatePath("/copywriter");
}
