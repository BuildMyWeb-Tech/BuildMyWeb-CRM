-- Add attachment support and reply-to threading to project chat messages
-- Migration 085

ALTER TABLE project_chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type  TEXT,   -- 'image' | 'pdf' | null
  ADD COLUMN IF NOT EXISTS attachment_name  TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_id      UUID REFERENCES project_chat_messages(id) ON DELETE SET NULL;

-- Index for fetching replies efficiently
CREATE INDEX IF NOT EXISTS idx_project_chat_reply_to ON project_chat_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

-- Make the body nullable so attachment-only messages are valid
ALTER TABLE project_chat_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE project_chat_messages ALTER COLUMN body SET DEFAULT '';
