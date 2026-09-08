CREATE TABLE IF NOT EXISTS todo_list.push_devices (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id BIGINT NOT NULL REFERENCES todo_list.users(id) ON DELETE CASCADE,
  installation_id VARCHAR(128) NOT NULL UNIQUE,
  token VARCHAR(512) NOT NULL UNIQUE,
  provider VARCHAR(20) NOT NULL,
  platform VARCHAR(20) NOT NULL,
  device_model VARCHAR(100),
  os_version VARCHAR(50),
  app_version VARCHAR(50),
  timezone VARCHAR(64),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_registered_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user_enabled
  ON todo_list.push_devices (user_id, enabled);

CREATE TABLE IF NOT EXISTS todo_list.push_deliveries (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  push_device_id BIGINT NOT NULL REFERENCES todo_list.push_devices(id) ON DELETE CASCADE,
  receipt_id VARCHAR(255) NOT NULL UNIQUE,
  notification_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  error_code VARCHAR(100),
  error_message TEXT,
  receipt_check_attempts INTEGER NOT NULL DEFAULT 0,
  next_receipt_check_at TIMESTAMP NOT NULL,
  checked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_pending
  ON todo_list.push_deliveries (status, next_receipt_check_at);
