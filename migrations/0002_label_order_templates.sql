-- 0002 · Stable label order, card and board templates.
-- Additive only: existing rows keep their data; new columns have defaults.

-- Labels: explicit order within a board. Before this, labels were ordered by created_at, which ties
-- for labels created in one transaction (the default set), so their order could change between loads.
ALTER TABLE labels ADD COLUMN position integer;
UPDATE labels l
   SET position = r.rn
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY board_id
             ORDER BY created_at,
                      array_position(ARRAY['green','yellow','orange','red','purple','blue','sky','lime','pink','black'], color) NULLS LAST,
                      name, id
           ) - 1 AS rn
      FROM labels
  ) r
 WHERE r.id = l.id;
ALTER TABLE labels ALTER COLUMN position SET NOT NULL;
CREATE INDEX labels_board_position ON labels (board_id, position);

-- New labels go to the end of their board's list unless a position is given.
CREATE FUNCTION labels_default_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(max(position) + 1, 0) INTO NEW.position FROM labels WHERE board_id = NEW.board_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER labels_default_position BEFORE INSERT ON labels FOR EACH ROW EXECUTE FUNCTION labels_default_position();

-- Card templates: cards marked as templates are used to create new cards.
ALTER TABLE cards ADD COLUMN is_template boolean NOT NULL DEFAULT false;

-- Board templates: offered as starting points when creating a board.
ALTER TABLE boards ADD COLUMN is_template boolean NOT NULL DEFAULT false;
