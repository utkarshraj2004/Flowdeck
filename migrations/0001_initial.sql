-- Flowdeck initial schema. Forward-only; see docs/OPERATIONS.md.
-- Positions use fractional-index string keys, compared byte-wise (COLLATE "C").

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,32}$'),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 100),
  initials text NOT NULL CHECK (char_length(initials) BETWEEN 1 AND 4),
  password_hash text,
  is_system_admin boolean NOT NULL DEFAULT false,
  disabled_at timestamptz,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- One-time links: first-admin setup and admin-issued password resets.
CREATE TABLE user_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('setup', 'reset')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '',
  settings jsonb NOT NULL DEFAULT '{"membersCanInvite": false, "defaultBoardVisibility": "workspace"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user ON workspace_members (user_id);

CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('link', 'email')),
  email text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  use_count int NOT NULL DEFAULT 0
);
CREATE INDEX invites_workspace ON invites (workspace_id);

CREATE TABLE boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  short_id text NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace')),
  background text NOT NULL DEFAULT 'ocean',
  prefs jsonb NOT NULL DEFAULT '{"comments": "members", "invitations": "members", "selfJoin": true, "cardCovers": true}'::jsonb,
  closed_at timestamptz,
  last_seq bigint NOT NULL DEFAULT 0,
  next_card_number int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX boards_workspace ON boards (workspace_id);

CREATE TABLE board_members (
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member', 'observer')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);
CREATE INDEX board_members_user ON board_members (user_id);

CREATE TABLE board_stars (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, board_id)
);

CREATE TABLE lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  position text COLLATE "C" NOT NULL,
  archived_at timestamptz,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lists_board_pos ON lists (board_id, position);

CREATE TABLE labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 100),
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX labels_board ON labels (board_id);

CREATE TABLE cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  number int NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 512),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 16384),
  position text COLLATE "C" NOT NULL,
  start_at timestamptz,
  due_at timestamptz,
  due_complete boolean NOT NULL DEFAULT false,
  cover jsonb,
  archived_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, number)
);
CREATE INDEX cards_list_pos ON cards (list_id, position);
CREATE INDEX cards_board ON cards (board_id);

CREATE TABLE card_labels (
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);
CREATE INDEX card_labels_label ON card_labels (label_id);

CREATE TABLE card_members (
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, user_id)
);
CREATE INDEX card_members_user ON card_members (user_id);

CREATE TABLE checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  position text COLLATE "C" NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklists_card ON checklists (card_id);

CREATE TABLE check_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 1000),
  position text COLLATE "C" NOT NULL,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX check_items_checklist ON check_items (checklist_id);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
CREATE INDEX comments_card ON comments (card_id, created_at);

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  uploader_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('file', 'link')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 256),
  url text,
  storage_key text,
  mime_type text,
  bytes bigint,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_card ON attachments (card_id);

-- Append-only board event log. seq is gap-free per board and drives realtime
-- delivery, reconnect replay and the activity feed.
CREATE TABLE activity (
  id bigserial PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  type text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  card_id uuid,
  list_id uuid,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_mutation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, seq)
);
CREATE INDEX activity_card ON activity (card_id, created_at DESC);

CREATE TABLE subscriptions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('board', 'list', 'card')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX subscriptions_target ON subscriptions (target_type, target_id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE,
  card_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
