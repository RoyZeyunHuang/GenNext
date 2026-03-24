/** 全量笔记 / Campaign PDF 共用的接口数据拉取 */

export type Kpi = {
  total_notes: number;
  total_exposure: number;
  total_views: number;
  total_interactions: number;
  total_follows: number;
  avg_interaction_rate: number;
  avg_collect_rate: number;
  avg_cover_ctr: number;
  follow_efficiency: number;
  paid_ratio: number;
};

export type ChangeMetric = { change: number; change_rate: number };

export type TrendPoint = {
  date: string;
  exposure: number;
  interactions: number;
  interaction_rate: number;
};

export type NotesComparison = {
  start_date: string | null;
  end_date: string | null;
  current: Kpi | null;
  changes: Record<string, ChangeMetric> | null;
  trend: TrendPoint[];
  no_comparison: boolean;
};

export type ByGenre = {
  video: { count: number; avg_interaction_rate: number; avg_collect_rate: number };
  image: { count: number; avg_interaction_rate: number; avg_collect_rate: number };
};

export type TopRow = {
  rank: number;
  title: string;
  genre: string;
  exposure: number;
  interaction_rate: number;
  collect_rate: number;
  follows: number;
  is_paid: boolean;
};

export type NotesReportBundle = {
  comparison: NotesComparison;
  byGenre: ByGenre | null;
  top10: TopRow[];
};

export async function loadNotesReportData(filters: {
  from_date: string;
  to_date: string;
  account_names?: string[];
}): Promise<{ ok: true; data: NotesReportBundle } | { ok: false; error: string }> {
  const account_names = filters.account_names ?? [];
  if (!filters.from_date || !filters.to_date) {
    return { ok: false, error: "缺少日期范围" };
  }

  const comparisonParams = new URLSearchParams({
    from_date: filters.from_date,
    to_date: filters.to_date,
  });
  account_names.forEach((name) => comparisonParams.append("account", name));

  const comparisonRes = await fetch(
    `/api/kpi/notes-comparison?${comparisonParams}`,
    { cache: "no-store" }
  );
  const comparisonData = await comparisonRes.json().catch(() => ({}));
  if (!comparisonRes.ok || comparisonData.error) {
    return {
      ok: false,
      error:
        typeof comparisonData.error === "string"
          ? comparisonData.error
          : "对比数据加载失败",
    };
  }

  const comparison: NotesComparison = {
    start_date: comparisonData.start_date ?? null,
    end_date: comparisonData.end_date ?? null,
    current: comparisonData.current ?? null,
    changes: comparisonData.changes ?? null,
    trend: Array.isArray(comparisonData.trend) ? comparisonData.trend : [],
    no_comparison: !!comparisonData.no_comparison,
  };

  if (!comparisonData.end_date) {
    return {
      ok: true,
      data: { comparison, byGenre: null, top10: [] },
    };
  }

  const statsParams = new URLSearchParams({
    snapshot_date: comparisonData.end_date,
    from_date: filters.from_date,
    to_date: filters.to_date,
  });
  account_names.forEach((name) => statsParams.append("account", name));

  const statsRes = await fetch(`/api/kpi/notes-stats?${statsParams}`, {
    cache: "no-store",
  });
  const statsData = await statsRes.json().catch(() => ({}));
  if (!statsRes.ok || statsData.error) {
    return {
      ok: true,
      data: {
        comparison,
        byGenre: null,
        top10: [],
      },
    };
  }

  return {
    ok: true,
    data: {
      comparison,
      byGenre: statsData.by_genre ?? null,
      top10: Array.isArray(statsData.top10) ? statsData.top10 : [],
    },
  };
}
