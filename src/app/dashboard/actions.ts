"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function addCalendarEvent(formData: FormData) {
  const title = formData.get("title") as string;
  const date = formData.get("date") as string;
  const start_time = (formData.get("start_time") as string) || null;
  const end_time = (formData.get("end_time") as string) || null;
  const location = (formData.get("location") as string) || null;
  if (!title?.trim() || !date) return;
  await supabase.from("calendar_events").insert({
    title: title.trim(),
    date,
    start_time: start_time || null,
    end_time: end_time || null,
    location: location?.trim() || null,
  });
  revalidatePath("/dashboard");
}

export async function addTodo(formData: FormData) {
  const content = formData.get("content") as string;
  if (!content?.trim()) return;
  await supabase.from("todos").insert({
    content: content.trim(),
    done: false,
  });
  revalidatePath("/dashboard");
}

export async function toggleTodo(id: string, done: boolean) {
  await supabase.from("todos").update({ done }).eq("id", id);
  revalidatePath("/dashboard");
}
