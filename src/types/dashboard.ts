export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  created_at: string;
}

export interface NewsItem {
  id: string;
  source_url: string | null;
  source_text: string | null;
  summary_zh: string | null;
  summary_en: string | null;
  tags: string[] | null;
  created_at: string;
}

export interface Todo {
  id: string;
  content: string;
  done: boolean;
  due_date: string | null;
  created_at: string;
}

export interface KpiEntry {
  id: string;
  period: string | null;
  period_type: string | null;
  category: string | null;
  metric_name: string;
  value: number;
  target: number;
  created_at: string;
}
