"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { areaLabel, tagColor, shouldShowTag, tagLabel } from "./format";

interface BuildingRow {
  id: string;
  name: string;
  address: string | null;
  area: string;
  tag: string | null;
  building_slug: string | null;
  is_tracked: boolean;
  note: string | null;
  active_rentals_count: number | null;
  open_rentals_count: number | null;
  last_fetched_at: string | null;
}

export function AdminWatchlistClient({ buildings }: { buildings: BuildingRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("");

  async function toggleTracked(id: string, next: boolean) {
    start(async () => {
      await fetch("/api/apartments/admin/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ building_id: id, is_tracked: next }),
      });
      router.refresh();
    });
  }

  async function saveNote(id: string, note: string) {
    start(async () => {
      await fetch("/api/apartments/admin/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ building_id: id, note }),
      });
      router.refresh();
    });
  }

  async function runRefresh() {
    const secret = prompt("请输入 CRON_SECRET (用于手动刷新):");
    if (!secret) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/apartments/cron/refresh?trigger=manual", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      const json = await res.json();
      alert(
        res.ok
          ? `完成。共 ${json.buildings_fetched} 栋楼,新增 ${json.listings_new} 套,花费 $${(json.cost_cents_estimate / 100).toFixed(2)}`
          : `失败: ${json.error}`
      );
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const q = filter.toLowerCase();
  const rows = q
    ? buildings.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.address ?? "").toLowerCase().includes(q) ||
          areaLabel(b.area).toLowerCase().includes(q)
      )
    : buildings;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="按名称 / 地址 / 区域搜索…"
          className="w-64 rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
        <Button onClick={runRefresh} disabled={refreshing} size="sm">
          <RefreshCw className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")} />
          {refreshing ? "抓取中…" : "立即刷新"}
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="w-20 px-3 py-2 text-left">跟踪</th>
            <th className="px-3 py-2 text-left">楼盘</th>
            <th className="px-3 py-2 text-left">地址</th>
            <th className="px-3 py-2 text-left">区域 / 标签</th>
            <th className="w-20 px-3 py-2 text-right">在租</th>
            <th className="px-3 py-2 text-left">备注</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-b last:border-0">
              <td className="px-3 py-2">
                <label className="inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={b.is_tracked}
                    disabled={pending}
                    onChange={(e) => toggleTracked(b.id, e.target.checked)}
                  />
                </label>
              </td>
              <td className="px-3 py-2 font-medium">{b.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{b.address}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">{areaLabel(b.area)}</span>
                  {shouldShowTag(b.tag) && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-semibold uppercase ring-1",
                        tagColor(b.tag)
                      )}
                    >
                      {tagLabel(b.tag)}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-right font-medium">
                {b.open_rentals_count ?? b.active_rentals_count ?? 0}
              </td>
              <td className="px-3 py-2">
                <EditableNote value={b.note ?? ""} onSave={(v) => saveNote(b.id, v)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground">
          没有匹配的楼盘。
        </div>
      )}
    </div>
  );
}

function EditableNote({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [dirty, setDirty] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <input
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setDirty(e.target.value !== value);
        }}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
        placeholder="管理员备注…"
      />
      {dirty && (
        <button
          onClick={() => {
            onSave(v);
            setDirty(false);
          }}
          className="rounded border px-2 py-1 text-xs hover:bg-accent"
        >
          保存
        </button>
      )}
    </div>
  );
}
