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
        <h1 className="text-xl font-bold">公寓 · 管理</h1>
        <p className="mt-3 text-muted-foreground">
          只有管理员可以修改楼盘跟踪列表。如果你应该是管理员,请把你的邮箱加到部署环境的 <code>ADMIN_EMAILS</code> 中。
        </p>
        <Link href="/apartments" className="mt-3 inline-block text-sm underline">
          ← 返回
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
          <h1 className="text-2xl font-bold">公寓 · 管理</h1>
          <p className="text-sm text-muted-foreground">
            管理团队的楼盘跟踪列表,可手动触发抓取刷新。
          </p>
        </div>
        <Link
          href="/apartments"
          className="rounded border px-3 py-1 text-xs hover:bg-accent"
        >
          ← 返回主页
        </Link>
      </header>

      <div className="rounded-lg border bg-card p-4 text-sm">
        <div className="flex flex-wrap gap-4">
          <span>
            上次抓取{" "}
            <strong>{lastRun?.finished_at ? formatAge(lastRun.finished_at) : "从未"}</strong>
          </span>
          <span>
            状态 <strong>{lastRun?.status ?? "—"}</strong>
          </span>
          <span>
            新增房源 <strong>{lastRun?.listings_new ?? 0}</strong>
          </span>
          <span>
            预估花费{" "}
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
