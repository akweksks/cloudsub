CREATE TABLE IF NOT EXISTS airport_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  airport_id INTEGER NOT NULL,
  node_name TEXT NOT NULL,
  node_type TEXT DEFAULT NULL,
  server TEXT DEFAULT NULL,
  port INTEGER DEFAULT NULL,
  source_profile TEXT DEFAULT NULL,
  fetched_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_airport_nodes_airport_id ON airport_nodes (airport_id);
