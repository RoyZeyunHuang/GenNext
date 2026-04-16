"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./CopyButton";
import { NYC_CAMPUSES } from "@/lib/apartments/constants";
import { cn } from "@/lib/utils";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; body: string; cached: boolean; generatedAt: string }
  | { kind: "error"; message: string };

export function PitchGenerator({
  buildingSlug,
  defaultSchool = "NYU WSQ",
}: {
  buildingSlug: string;
  defaultSchool?: string;
}) {
  const [school, setSchool] = useState(defaultSchool);
  const [state, setState] = useState<State>({ kind: "idle" });

  // On school change → check if a cached pitch exists (free lookup, no Claude call)
  useEffect(() => {
    let alive = true;
    setState({ kind: "idle" });
    const url = `/api/apartments/buildings/${encodeURIComponent(buildingSlug)}/pitch?school_short=${encodeURIComponent(school)}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.pitch) {
          setState({
            kind: "ok",
            body: j.pitch.body,
            cached: true,
            generatedAt: j.pitch.created_at,
          });
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [school, buildingSlug]);

  async function generate(force = false) {
    setState({ kind: "loading" });
    try {
      const res = await fetch(
        `/api/apartments/buildings/${encodeURIComponent(buildingSlug)}/pitch`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ school_short: school, force }),
        }
      );
      const j = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: j.error ?? "failed" });
        return;
      }
      setState({
        kind: "ok",
        body: j.body,
        cached: !!j.cached,
        generatedAt: j.generated_at,
      });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "failed" });
    }
  }

  return (
    <section className="rounded-xl border bg-gradient-to-br from-amber-50/50 to-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-amber-600" /> AI 卖点 brief
        </h3>
        <span className="text-xs text-muted-foreground">汇总本楼的客观卖点供你写推介参考</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              disabled={state.kind === "loading"}
            >
              {NYC_CAMPUSES.map((c) => (
                <option key={c.shortName} value={c.shortName}>{c.shortName}</option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            onClick={() => generate(state.kind === "ok")}
            disabled={state.kind === "loading"}
          >
            {state.kind === "loading" ? (
              <><RefreshCw className="mr-1 h-3 w-3 animate-spin" /> 生成中…</>
            ) : state.kind === "ok" ? (
              <><RefreshCw className="mr-1 h-3 w-3" /> 重新生成</>
            ) : (
              <><Sparkles className="mr-1 h-3 w-3" /> 生成</>
            )}
          </Button>
        </div>
      </div>

      {state.kind === "ok" && (
        <>
          <div className="mt-3 whitespace-pre-wrap rounded-md border bg-background p-3 text-sm leading-relaxed">
            {state.body}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {state.cached ? "缓存版本" : "刚刚生成"} · {state.body.length} 字 · 30 天后自动刷新
            </span>
            <CopyButton text={state.body} label="📋 复制" copiedLabel="✓ 已复制" size="xs" />
          </div>
        </>
      )}

      {state.kind === "error" && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {state.message}
        </div>
      )}

      {state.kind === "idle" && (
        <p className="mt-3 text-xs text-muted-foreground">
          点 <strong>生成</strong>,AI 会从本楼实时数据 + 同区其他楼对比中
          提炼一份针对 <strong>{school}</strong> 的客观卖点清单
          (价格/配套/通勤/同区对比/时机),你可以挑感兴趣的点自己组织语言写推介。
        </p>
      )}
    </section>
  );
}
