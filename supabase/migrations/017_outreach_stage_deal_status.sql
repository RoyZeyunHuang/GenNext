-- Outreach dual-dimension: stage (pipeline) + deal_status
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS stage text DEFAULT 'Not Started';
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS deal_status text DEFAULT 'Active';
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS price text;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS term text;

-- Migrate old status to stage
UPDATE outreach SET stage = status WHERE status IS NOT NULL;
UPDATE outreach SET deal_status = 'Active' WHERE deal_status IS NULL;

-- Map legacy status values to new stage
UPDATE outreach SET stage = 'Pitched'   WHERE stage IN ('Emailed', 'Contacted', 'Proposal Sent');
UPDATE outreach SET stage = 'Meeting'   WHERE stage = 'Meeting Scheduled';
UPDATE outreach SET stage = 'Negotiating' WHERE stage = 'In Discussion';
