ALTER TABLE todo_list.rewards
  ADD COLUMN IF NOT EXISTS image_url varchar(1000),
  ADD COLUMN IF NOT EXISTS available_from timestamptz,
  ADD COLUMN IF NOT EXISTS exchange_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

ALTER TABLE todo_list.rewards
  DROP CONSTRAINT IF EXISTS chk_rewards_stock_quantity;

ALTER TABLE todo_list.rewards
  ADD CONSTRAINT chk_rewards_stock_quantity CHECK (stock_quantity >= 0);

ALTER TABLE todo_list.user_rewards
  ADD COLUMN IF NOT EXISTS reward_image_url varchar(1000);
