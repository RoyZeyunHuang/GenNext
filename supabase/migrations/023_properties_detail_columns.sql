-- 一次性导入 scripts/import-property-details.js 所需字段（若已有则跳过）
ALTER TABLE properties ADD COLUMN IF NOT EXISTS price_range text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS units integer;
