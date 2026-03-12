"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function deleteDocument(id: string) {
  await supabase.from("documents").delete().eq("id", id);
  revalidatePath("/documents");
}
