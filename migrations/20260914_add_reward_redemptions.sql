CREATE TABLE IF NOT EXISTS todo_list.reward_redemptions (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id BIGINT NOT NULL REFERENCES todo_list.users(id) ON DELETE CASCADE,
  reward_id BIGINT NOT NULL REFERENCES todo_list.rewards(id),
  idempotency_key VARCHAR(36) NOT NULL,
  point INTEGER NOT NULL CHECK (point >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  user_reward_id BIGINT UNIQUE REFERENCES todo_list.user_rewards(id) ON DELETE SET NULL,
  CONSTRAINT uq_reward_redemptions_user_key UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user_created
  ON todo_list.reward_redemptions (user_id, created_at DESC);
