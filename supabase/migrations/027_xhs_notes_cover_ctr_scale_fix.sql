-- 封面点击率历史入库多除了一次 100（例：DB 0.00142 应为 14.2% → 小数 0.142）
-- 将存量 cover_ctr 统一 ×100 修正为小数率，与导入逻辑及 KPI 展示（×100 为 %）一致
UPDATE xhs_notes
SET cover_ctr = cover_ctr * 100
WHERE cover_ctr IS NOT NULL;
