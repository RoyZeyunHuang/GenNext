export interface DocumentRow {
  id: string;
  name: string | null;
  type: string | null;
  content: string | null;
  file_url: string | null;
  created_at: string;
}

export const DOCUMENT_TYPES = [
  "产品资料",
  "品牌手册",
  "历史文案",
  "竞品参考",
] as const;
