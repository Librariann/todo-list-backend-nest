ALTER TABLE todo_list.habits
  ADD COLUMN IF NOT EXISTS reminder_time VARCHAR(5),
  ADD COLUMN IF NOT EXISTS reminder_days INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reminder_date DATE;

CREATE INDEX IF NOT EXISTS idx_habits_pending_reminders
  ON todo_list.habits (next_reminder_at)
  WHERE is_active = true AND next_reminder_at IS NOT NULL;
