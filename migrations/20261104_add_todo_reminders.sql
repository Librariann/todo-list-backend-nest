ALTER TABLE todo_list.todos
  ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_todos_pending_reminders
  ON todo_list.todos (reminder_at)
  WHERE reminder_at IS NOT NULL;
