CREATE TABLE IF NOT EXISTS todo_list.challenge_rotation_runs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  period_type VARCHAR NOT NULL,
  period_key DATE NOT NULL,
  trigger VARCHAR NOT NULL,
  status VARCHAR NOT NULL,
  requested_count SMALLINT NOT NULL,
  selected_count SMALLINT NOT NULL,
  selected_challenges JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor_user_id BIGINT NULL,
  message VARCHAR NULL
);

CREATE INDEX IF NOT EXISTS idx_challenge_rotation_runs_period
  ON todo_list.challenge_rotation_runs (period_type, period_key DESC, created_at DESC);

INSERT INTO todo_list.challenge_rotation_runs (
  created_at,
  updated_at,
  period_type,
  period_key,
  trigger,
  status,
  requested_count,
  selected_count,
  selected_challenges,
  actor_user_id,
  message
)
SELECT
  MIN(assignment.created_at),
  MIN(assignment.created_at),
  assignment.period_type,
  assignment.period_key,
  'LEGACY',
  'SUCCESS',
  COUNT(*)::smallint,
  COUNT(*)::smallint,
  jsonb_agg(
    jsonb_build_object(
      'id', assignment.challenge_id,
      'name', assignment.name,
      'workType', assignment.work_type
    )
    ORDER BY assignment.position
  ),
  NULL,
  '운영 이력 기능 도입 전 선발'
FROM todo_list.challenge_assignments assignment
WHERE NOT EXISTS (
  SELECT 1
  FROM todo_list.challenge_rotation_runs run
  WHERE run.period_type = assignment.period_type
    AND run.period_key = assignment.period_key
)
GROUP BY assignment.period_type, assignment.period_key;
