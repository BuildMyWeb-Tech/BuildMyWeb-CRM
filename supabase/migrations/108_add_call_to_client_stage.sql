-- Add "Call To Client" stage to all accounts' Daily Tasks pipelines.
-- Idempotent — skips if already present.
DO $$
DECLARE
  pl RECORD;
  max_pos INT;
BEGIN
  FOR pl IN
    SELECT p.id AS pipeline_id
    FROM pipelines p
    WHERE p.name = 'Daily Tasks'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pipeline_stages
      WHERE pipeline_id = pl.pipeline_id AND name = 'Call To Client'
    ) THEN
      SELECT COALESCE(MAX(position), 0) + 1 INTO max_pos
      FROM pipeline_stages WHERE pipeline_id = pl.pipeline_id;

      INSERT INTO pipeline_stages (pipeline_id, name, position, color)
      VALUES (pl.pipeline_id, 'Call To Client', max_pos, '#f97316');
    END IF;
  END LOOP;
END $$;
