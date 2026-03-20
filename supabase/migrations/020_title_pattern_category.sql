-- 内容工厂：标题套路类别 + 默认文档
INSERT INTO doc_categories (name, icon, description, is_auto_include, sort_order)
SELECT '标题套路', '🏷️', '定义 AI 生成标题时的变体类型', false, 6
WHERE NOT EXISTS (SELECT 1 FROM doc_categories WHERE name = '标题套路');

INSERT INTO docs (category_id, title, content, sort_order)
SELECT c.id,
  '默认标题套路',
  '每次生成内容时，同时生成以下变体标题：

1. 悬念型：用疑问或未完成的句子制造好奇心，让人想点进来看答案
2. 数据型：用具体数字或对比数据开头，给人信息量的感觉
3. 情绪型：用第一人称真实感受切入，引发共鸣
4. 反转型：先说一个常见认知，再推翻它，制造反差
5. 对话型：像在跟朋友说话，口语化，亲切感强',
  0
FROM doc_categories c
WHERE c.name = '标题套路'
  AND NOT EXISTS (
    SELECT 1 FROM docs d WHERE d.category_id = c.id AND d.title = '默认标题套路'
  );
