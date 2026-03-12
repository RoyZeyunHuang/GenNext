-- 品牌档案
CREATE TABLE IF NOT EXISTS brand_docs (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text,
  property_name text,
  tags text[],
  is_global boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 知识库
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text,
  type text,
  tags text[],
  source_url text,
  created_at timestamptz default now()
);

-- 任务模板
CREATE TABLE IF NOT EXISTS task_templates (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  platform text,
  content text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 人格模板
CREATE TABLE IF NOT EXISTS persona_templates (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  content text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 文案生成历史（新版）
CREATE TABLE IF NOT EXISTS generated_copies_v2 (
  id uuid default gen_random_uuid() primary key,
  user_input text,
  brand_doc_ids text[],
  knowledge_doc_ids text[],
  task_template_id uuid,
  persona_template_id uuid,
  detected_intent jsonb,
  output text,
  platform text,
  starred boolean default false,
  created_at timestamptz default now()
);

-- RLS
ALTER TABLE brand_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_copies_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_brand_docs" ON brand_docs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_brand_docs" ON brand_docs FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_knowledge_docs" ON knowledge_docs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_knowledge_docs" ON knowledge_docs FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_task_templates" ON task_templates FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_task_templates" ON task_templates FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_persona_templates" ON persona_templates FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_persona_templates" ON persona_templates FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_generated_copies_v2" ON generated_copies_v2 FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_generated_copies_v2" ON generated_copies_v2 FOR ALL TO anon USING (true) WITH CHECK (true);

-- 预设任务模板
INSERT INTO task_templates (title, platform, content, is_default) VALUES
('小红书种草', 'xiaohongshu', '第一行用疑问句或反常识句作标题；正文描述一个真实生活场景；自然带入3个产品亮点；结尾用问句引导评论。字数300-400字，emoji适量，禁止用震撼/绝美/强烈推荐', true),
('Instagram Caption', 'instagram', '第一行强钩子英文10字以内；空行；2-3句有画面感描述；空行；10-15个hashtags混合大小标签。字数150字以内，lifestyle感', true),
('LinkedIn 专业帖', 'linkedin', '开头用数据或洞察引入；中间3个要点，每点一段；结尾一个行业问题引发讨论。专业但不刻板，300字以内', true),
('微信跟进消息', 'wechat', '提及上次沟通具体细节；一句话带出联系原因；明确但不强迫的行动号召。100字以内，禁止用打扰了开头', true);

-- 预设人格模板
INSERT INTO persona_templates (title, description, content, is_default) VALUES
('牛马人设', '真实、自嘲、打工人视角', '你是一个在纽约打拼的普通人，说话真实有温度，会自嘲，用打工人视角看生活。不说教，不装，像朋友聊天。', false),
('傲娇人设', '高冷、反向营销、爱答不理', '你高冷但有品位，说话反向营销，不追着用户跑，让用户来追你。语气淡淡的，但每句话都有料。', false),
('专业人设', '数据说话、权威感、行业专家', '你是纽约地产行业专家，用数据和事实说话，有权威感但不傲慢。读者看完会觉得学到了东西。', true),
('生活博主人设', '温暖、有画面感、讲故事', '你是一个热爱生活的内容创作者，善于用细节描述画面，让读者有代入感。温暖治愈，故事感强。', false);
