-- docs 表增加 role 字段：标记每篇文档在 prompt 中的角色
-- constraint = 硬约束（品牌档案、合规红线），必须遵守
-- reference  = 参考素材（知识库），可选取用
-- style      = 风格定义（人格模板），受浓度参数调控
-- format     = 输出格式（任务模板、标题套路），控制输出结构

ALTER TABLE docs ADD COLUMN IF NOT EXISTS role text DEFAULT 'reference';

ALTER TABLE docs DROP CONSTRAINT IF EXISTS docs_role_check;
ALTER TABLE docs ADD CONSTRAINT docs_role_check
  CHECK (role IN ('constraint', 'reference', 'style', 'format'));

UPDATE docs SET role = 'constraint'
WHERE category_id IN (SELECT id FROM doc_categories WHERE name = '品牌档案');

UPDATE docs SET role = 'reference'
WHERE category_id IN (SELECT id FROM doc_categories WHERE name = '知识库');

UPDATE docs SET role = 'format'
WHERE category_id IN (SELECT id FROM doc_categories WHERE name IN ('任务模板', '标题套路'));

UPDATE docs SET role = 'style'
WHERE category_id IN (SELECT id FROM doc_categories WHERE name = '人格模板');

ALTER TABLE docs ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS priority int DEFAULT 3;

COMMENT ON COLUMN docs.role IS 'prompt 角色：constraint(硬约束) | reference(参考) | style(风格) | format(格式)';
