-- 0003 · Unread markers on cards, automation rules, outgoing webhooks, optional email.
-- Additive only: new tables, one new nullable column and new indexes. Existing rows are untouched.

-- Unread markers: a card shows a marker for a user while that user has unread notifications about it.
-- Notifications are already stored per user, so this index is all the board snapshot needs.
CREATE INDEX notifications_unread_cards ON notifications (user_id, board_id) WHERE read_at IS NULL AND card_id IS NOT NULL;

-- Email digests: which notifications were already included in an email.
ALTER TABLE notifications ADD COLUMN emailed_at timestamptz;
CREATE INDEX notifications_unemailed ON notifications (user_id, created_at) WHERE read_at IS NULL AND emailed_at IS NULL;

-- Automation: one trigger and one or more actions per rule, scoped to a board.
CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger jsonb NOT NULL,
  actions jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  run_count integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_error text,
  last_error_at timestamptz
);
CREATE INDEX automation_rules_board ON automation_rules (board_id) WHERE enabled;

-- "Due soon" rules fire once per card and due date.
CREATE TABLE automation_due_runs (
  rule_id uuid NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, card_id, due_at)
);

-- Outgoing webhooks: signed POSTs of board activity, retried with backoff.
CREATE TABLE webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  events text[],
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhooks_board ON webhooks (board_id) WHERE enabled;

CREATE TABLE webhook_deliveries (
  id bigserial PRIMARY KEY,
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  seq bigint,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX webhook_deliveries_hook ON webhook_deliveries (webhook_id, id DESC);

-- Email outbox: only used when SMTP is configured. Messages are sent by the background worker and retried.
CREATE TABLE email_outbox (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  to_address text NOT NULL,
  kind text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX email_outbox_due ON email_outbox (next_attempt_at) WHERE status = 'pending';
