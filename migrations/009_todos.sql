-- ===========================================================
-- 009_todos.sql
-- Notes-app style todos. Each line is a todo.
-- Completed items stay visible the day they're completed,
-- then auto-archive the next day on first fetch.
-- ===========================================================

CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,                                -- when checked off
  archived_at TIMESTAMP,                                 -- when moved to graveyard
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS todos_user_id_idx ON todos(user_id);
CREATE INDEX IF NOT EXISTS todos_archived_idx ON todos(archived_at);
CREATE INDEX IF NOT EXISTS todos_completed_idx ON todos(completed_at);
CREATE INDEX IF NOT EXISTS todos_sort_idx ON todos(user_id, sort_order);
