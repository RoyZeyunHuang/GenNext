-- 同一开发商多楼盘专用模版（021 原版两套不动）
-- 占位符含 {{property_intro_sentence}}、{{leasing_support_phrase}} / {{leasing_goals_focus}} 等，由 buildDeveloperBatchTemplateVars 填充

INSERT INTO email_templates (name, subject, body)
SELECT
  'INVO — Established Buildings — Multi',
  'Partnership — {{property_name}}',
  $t$Hi {{contact_name}},
Hope you're doing well. {{property_intro_sentence}}
For more established rental buildings, one of the biggest challenges is maintaining strong occupancy over time. As renewals become more difficult, competition increases, and tenant expectations continue to rise, even small gaps in retention can quickly lead to costly vacancy loss and slower leasing momentum.
That's where we come in.
At INVO by USWOO, our advantages include:
• AI-driven marketing optimization — We identify which channels, creatives, and audience segments are actually performing, then quickly reallocate budget toward what drives real inquiries and qualified traffic.
• Faster lead response — Our AI agent system helps capture and respond to prospects immediately, across time zones, so strong leads do not go cold.
• Access to overlooked renter audiences — Through our official Rednote partnership, we help properties reach international and lifestyle-driven renter segments that traditional channels often miss.

I'd be happy to explore how we can support {{leasing_support_phrase}} while helping strengthen long-term community performance.
Best,
Becca$t$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'INVO — Established Buildings — Multi');

INSERT INTO email_templates (name, subject, body)
SELECT
  'INVO — New Buildings — Multi',
  'Partnership — {{property_name}}',
  $t$Hi {{contact_name}},
Hope you're doing well. {{property_intro_sentence}}
For new rental buildings, one of the biggest challenges is building strong leasing momentum early and maintaining it as competition continues to increase. Even with a strong product, projects can lose traction if visibility is not targeted, lead response is delayed, or the right renter segments are not reached quickly enough.
That's where we come in.
At INVO by USWOO, our advantages include:
• AI-driven marketing optimization — We identify which channels, creatives, and audience segments are actually performing, then quickly shift budget toward what is driving real inquiries and qualified traffic.
• Faster lead response — Our AI agent system helps capture and respond to prospects immediately, across time zones, so strong leads do not go cold.
• Access to overlooked renter audiences — Through our official Rednote partnership, we help properties reach international and lifestyle-driven renter segments that traditional channels often miss.
• Real estate-focused execution — We understand the pressure new buildings face around lease-up velocity, early-stage traction, and standing out in a competitive market. Our focus is on turning visibility into qualified traffic and consistent leasing momentum.
I'd be happy to explore how we can support {{leasing_goals_focus}} and help strengthen long-term building performance.
Best,
Becca$t$
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'INVO — New Buildings — Multi');
