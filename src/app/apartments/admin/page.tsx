import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/apartments/auth";
import { AdminWatchlistClient } from "@/components/apartments/AdminWatchlistClient";
import { formatAge } from "@/components/apartments/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminWatchlistPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/apartments/admin");
  if (!user.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-sm">
        <h1 className="text-xl font-bold">Apartments · Admin</h1>
        <p className="mt-3 text-muted-foreground">
          Only the admin can edit the watchlist. If this should be you, set
          your email in <code>ADMIN_EMAILS</code> in the deploy env.
        </p>
        <Link href="/apartments" className="mt-3 inline-block text-sm underline">
          ← Back
        </Link>
      </div>
    );
  }

  const db = getSupabaseAdmin();
  const [{ data: buildings }, { data: lastRun }] = await Promise.all([
    db
      .from("apt_buildings")
      .select(
        "id, name, address, area, tag, building_slug, is_tracked, note, " +
          "active_rentals_count, open_rentals_count, last_fetched_at"
      )
      .order("area", { ascending: true })
      .order("tag", { ascending: true })
      .order("name", { ascending: true }),
    db
      .from("apt_refresh_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-4 lg:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Apartments · Admin</h1>
          <p className="text-sm text-muted-foreground">
            Toggle which buildings are on the team watchlist; trigger a manual refresh.
          </p>
        </div>
        <Link
          href="/apartments"
          className="rounded border px-3 py-1 text-xs hover:bg-accent"
        >
          ← Back to dashboard
        </Link>
      </header>

      <div className="rounded-lg border bg-card p-4 text-sm">
        <div className="flex flex-wrap gap-4">
          <span>
            Last scan{" "}
            <strong>{lastRun?.finished_at ? formatAge(lastRun.finished_at) : "never"}</strong>
          </span>
          <span>
            Status <strong>{lastRun?.status ?? "—"}</strong>
          </span>
          <span>
            New units <strong>{lastRun?.listings_new ?? 0}</strong>
          </span>
          <span>
            Cost estimate{" "}
            <strong>
              ${((lastRun?.cost_cents_estimate ?? 0) / 100).toFixed(2)}
            </strong>
          </span>
        </div>
      </div>

      <AdminWatchlistClient buildings={buildings ?? []} />
    </div>
  );
}
