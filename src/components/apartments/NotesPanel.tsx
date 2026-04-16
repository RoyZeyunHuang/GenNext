"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAge } from "./format";

interface Note {
  id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
}

export function NotesPanel({
  notes,
  buildingId,
  listingId,
  currentUserId,
}: {
  notes: Note[];
  buildingId?: string;
  listingId?: string;
  currentUserId?: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scope = buildingId ? "building" : "listing";
  const kind = buildingId ? "building" : "listing";

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/apartments/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          [`${scope}_id`]: buildingId ?? listingId,
          body: draft,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "failed");
      setDraft("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this note?")) return;
    const res = await fetch(`/api/apartments/notes?id=${id}&kind=${kind}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="font-semibold">📝 Team Notes</h3>
        <span className="text-xs text-muted-foreground">{notes.length}</span>
      </div>
      <div className="space-y-3 p-3">
        {notes.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No team notes yet. Add what you&rsquo;ve learned about this{" "}
            {scope}: leasing office quirks, fee tricks, hidden costs, which
            broker owns it.
          </p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="rounded-md border bg-background p-3">
              <div className="whitespace-pre-wrap text-sm">{n.body}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  — {n.author_email ?? "?"} · {formatAge(n.created_at)}
                </span>
                {currentUserId && currentUserId === n.author_id && (
                  <button
                    onClick={() => del(n.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" /> delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          maxLength={3500}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {draft.length > 0 ? `${draft.length} / 3500` : "Visible to your whole team."}
          </span>
          <div className="flex items-center gap-2">
            {err && <span className="text-xs text-destructive">{err}</span>}
            <Button size="sm" onClick={submit} disabled={busy || !draft.trim()}>
              {busy ? "Posting…" : "Post note"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
