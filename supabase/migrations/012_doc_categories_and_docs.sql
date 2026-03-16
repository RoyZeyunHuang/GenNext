-- 内容工厂：动态类别 + 统一文档表
CREATE TABLE doc_categories (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  icon text default '📁',
  description text,
  is_auto_include boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

ALTER TABLE doc_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on doc_categories" ON doc_categories
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO doc_categories (name, icon, description, is_auto_include, sort_order) VALUES
('品牌档案', '📋', '公司信息、楼盘资料、品牌规范', true, 1),
('知识库', '📚', '新闻、数据、市场报告、参考资料', false, 2),
('任务模板', '📝', '不同平台和场景的内容结构模板', false, 3),
('人格模板', '🎭', '不同说话风格和人设定义', false, 4);

CREATE TABLE docs (
  id uuid default gen_random_uuid() primary key,
  category_id uuid not null references doc_categories(id) on delete cascade,
  title text not null,
  content text,
  tags text[],
  metadata jsonb default '{}',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE INDEX idx_docs_category ON docs(category_id);

CREATE OR REPLACE FUNCTION set_docs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER docs_updated_at
  BEFORE UPDATE ON docs
  FOR EACH ROW EXECUTE PROCEDURE set_docs_updated_at();

ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on docs" ON docs
  FOR ALL USING (true) WITH CHECK (true);

-- 迁移旧表数据（若存在）
DO $$
DECLARE
  cat_brand uuid;
  cat_knowledge uuid;
  cat_task uuid;
  cat_persona uuid;
BEGIN
  SELECT id INTO cat_brand FROM doc_categories WHERE name = '品牌档案' LIMIT 1;
  SELECT id INTO cat_knowledge FROM doc_categories WHERE name = '知识库' LIMIT 1;
  SELECT id INTO cat_task FROM doc_categories WHERE name = '任务模板' LIMIT 1;
  SELECT id INTO cat_persona FROM doc_categories WHERE name = '人格模板' LIMIT 1;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brand_docs') THEN
    INSERT INTO docs (category_id, title, content, tags, metadata, sort_order, created_at, updated_at)
    SELECT cat_brand, b.title, b.content, COALESCE(b.tags, ARRAY[]::text[]),
           jsonb_build_object('property_name', b.property_name, 'is_global', COALESCE(b.is_global, false)),
           0, b.created_at, COALESCE(b.updated_at, b.created_at)
    FROM brand_docs b;
    DROP TABLE brand_docs;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'knowledge_docs') THEN
    INSERT INTO docs (category_id, title, content, tags, metadata, sort_order, created_at, updated_at)
    SELECT cat_knowledge, k.title, k.content, COALESCE(k.tags, ARRAY[]::text[]),
           jsonb_build_object('type', k.type, 'source_url', k.source_url),
           0, k.created_at, k.created_at
    FROM knowledge_docs k;
    DROP TABLE knowledge_docs;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'task_templates') THEN
    INSERT INTO docs (category_id, title, content, metadata, sort_order, created_at, updated_at)
    SELECT cat_task, t.title, t.content,
           jsonb_build_object('platform', t.platform, 'is_default', COALESCE(t.is_default, false)),
           0, t.created_at, COALESCE(t.updated_at, t.created_at)
    FROM task_templates t;
    DROP TABLE task_templates;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'persona_templates') THEN
    INSERT INTO docs (category_id, title, content, metadata, sort_order, created_at, updated_at)
    SELECT cat_persona, p.title, p.content,
           jsonb_build_object('description', p.description, 'is_default', COALESCE(p.is_default, false)),
           0, p.created_at, COALESCE(p.updated_at, p.created_at)
    FROM persona_templates p;
    DROP TABLE persona_templates;
  END IF;
END $$;

-- 文案生成历史支持新格式：用 doc_ids 存选中的文档 id
ALTER TABLE generated_copies_v2 ADD COLUMN IF NOT EXISTS doc_ids uuid[] DEFAULT '{}';
