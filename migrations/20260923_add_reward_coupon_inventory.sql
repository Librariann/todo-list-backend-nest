-- Run against the existing todo_list schema before deploying coupon inventory.
-- Legacy stock_quantity is not converted: only uploaded real coupons are sellable.
CREATE TABLE IF NOT EXISTS todo_list.reward_coupons (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reward_id BIGINT NOT NULL REFERENCES todo_list.rewards(id),
  provider VARCHAR(20) NOT NULL DEFAULT 'GIFTISHOW',
  provider_order_number VARCHAR(100),
  encrypted_pin TEXT NOT NULL,
  pin_hash VARCHAR(64) NOT NULL,
  pin_last_four VARCHAR(4) NOT NULL,
  image_object_key VARCHAR(300) NOT NULL,
  image_content_type VARCHAR(30) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  assigned_user_id BIGINT REFERENCES todo_list.users(id),
  user_reward_id BIGINT REFERENCES todo_list.user_rewards(id),
  assigned_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_coupons_pin_hash
  ON todo_list.reward_coupons (pin_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_coupons_user_reward
  ON todo_list.reward_coupons (user_reward_id);
CREATE INDEX IF NOT EXISTS idx_reward_coupons_available
  ON todo_list.reward_coupons (reward_id, status, expires_at);
