CREATE TABLE IF NOT EXISTS todo_list.notification_preferences (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id BIGINT NOT NULL UNIQUE REFERENCES todo_list.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  daily_reminder_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
  next_reminder_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_preferences_user
  ON todo_list.notification_preferences (user_id);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_due
  ON todo_list.notification_preferences (push_enabled, next_reminder_at);
