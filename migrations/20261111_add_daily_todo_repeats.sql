ALTER TABLE todo_list.todos
  ADD COLUMN IF NOT EXISTS repeat_daily BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS repeat_series_id UUID,
  ADD COLUMN IF NOT EXISTS reminder_time VARCHAR(5);

UPDATE todo_list.todos
SET reminder_time = to_char(reminder_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI')
WHERE reminder_at IS NOT NULL AND reminder_time IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_todos_repeat_date
  ON todo_list.todos (repeat_series_id, target_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_todos_active_repeat
  ON todo_list.todos (repeat_series_id)
  WHERE repeat_daily;

CREATE INDEX IF NOT EXISTS idx_todos_active_repeat_dates
  ON todo_list.todos (target_date, user_id)
  WHERE repeat_daily;
