-- Extend notifications for v2: more types, categories, action URL, mention support

-- Add new columns
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system'
    CHECK (category IN ('urgent', 'reminder', 'assignment', 'mention', 'completed', 'system')),
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS mention_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Extend allowed types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      'conversation_assigned',
      'lead_follow_up_due',
      'task_assigned',
      'task_overdue',
      'task_completed',
      'mentioned',
      'system'
    )
  );

-- Grant read on new column to authenticated role
GRANT SELECT ON notifications TO authenticated;
