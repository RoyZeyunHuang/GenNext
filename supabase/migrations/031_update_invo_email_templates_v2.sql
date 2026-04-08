-- 更新 INVO 邮件模板 v2
-- 更新文案、卡片式 bullet 设计、{{cities_two}} 占位符
-- 注意：table 前后不留空行，避免 wrapEmailHtml \n→<br> 产生多余间距

-- ============================================================
-- 1. Established Buildings（单楼）
-- ============================================================
UPDATE email_templates
SET
  subject = 'Partnership — {{property_name}}',
  body    = $t$Hi {{contact_name}},

I wanted to reach out because we've been seeing growing renter interest in <strong>{{cities_two}}</strong> through our channels, and <strong>{{property_name}}</strong> feels like the kind of property where stronger digital marketing could make a real difference.

We're <strong>INVO by USWOO</strong>, a NYC-based real estate marketing team that helps buildings do three things better: <strong>Attract the Right Renters, Protect Occupancy, and Build Stronger Retention.</strong>

The areas we usually help most with are:
<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td width="32%" style="background:#faf9f7;border:1px solid #e7e5e4;border-radius:6px;padding:14px 12px;font-size:12px;line-height:1.6;color:#1C1917;vertical-align:top;"><div style="color:#d72638;font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Qualified Traffic</div>More qualified leads, less wasted outreach</td><td width="2%"></td><td width="32%" style="background:#faf9f7;border:1px solid #e7e5e4;border-radius:6px;padding:14px 12px;font-size:12px;line-height:1.6;color:#1C1917;vertical-align:top;"><div style="color:#d72638;font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Smarter Spend</div>See exactly which channels perform and which don't</td><td width="2%"></td><td width="32%" style="background:#faf9f7;border:1px solid #e7e5e4;border-radius:6px;padding:14px 12px;font-size:12px;line-height:1.6;color:#1C1917;vertical-align:top;"><div style="color:#d72638;font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Stronger Retention</div>Keep residents longer with smarter renewal outreach</td></tr></table>
We're currently expanding into more growth neighborhoods where strong digital presence matters even more, and I'd love to see if there could be a fit.

You can view our work at <a href="https://invonyc.com" style="color:#d72638;font-weight:bold;">INVO WEBSITE</a>, I'd be happy to set up a short intro call.$t$
WHERE name = 'INVO — Established Buildings';

-- ============================================================
-- 2. New Buildings（单楼）
-- ============================================================
UPDATE email_templates
SET
  subject = 'Partnership — {{property_name}}',
  body    = $t$Hi {{contact_name}},

I wanted to reach out because we've been seeing rising renter interest in <strong>{{cities_two}}</strong>, and <strong>{{property_name}}</strong> immediately stood out as the kind of new building that could benefit from more intentional digital positioning.

We're <strong>INVO by USWOO</strong>, a NYC-based real estate marketing team that helps new developments launch with stronger visibility, sharper positioning, and better lease-up momentum.

The areas we usually help most with are:
<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td width="32%" style="background:#faf9f7;border:1px solid #e7e5e4;border-radius:6px;padding:14px 12px;font-size:12px;line-height:1.6;color:#1C1917;vertical-align:top;"><div style="color:#d72638;font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Early Momentum</div>Qualified renters from day one of the leasing cycle</td><td width="2%"></td><td width="32%" style="background:#faf9f7;border:1px solid #e7e5e4;border-radius:6px;padding:14px 12px;font-size:12px;line-height:1.6;color:#1C1917;vertical-align:top;"><div style="color:#d72638;font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Stand Out</div>A digital presence that feels distinct, not generic</td><td width="2%"></td><td width="32%" style="background:#faf9f7;border:1px solid #e7e5e4;border-radius:6px;padding:14px 12px;font-size:12px;line-height:1.6;color:#1C1917;vertical-align:top;"><div style="color:#d72638;font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Lease-Up Speed</div>Faster fill-up through content, story, and targeted traffic</td></tr></table>
For new buildings, the early stage matters most. The right marketing can help shape brand perception, drive initial momentum, and position the property more competitively from day one.

You can view our work at <a href="https://invonyc.com" style="color:#d72638;font-weight:bold;">INVO WEBSITE</a>. If open, I'd be happy to set up a short intro call.$t$
WHERE name = 'INVO — New Buildings';
