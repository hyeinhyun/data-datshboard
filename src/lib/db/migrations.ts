/**
 * Ordered schema migrations. Each entry runs once, inside a transaction, and is
 * recorded in `schema_migrations`. Append new entries; never edit old ones.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "0001_core",
    sql: `
      CREATE TABLE superpacks (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        source      TEXT NOT NULL CHECK (source IN ('excel', 'user')),
        description TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE datapacks (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE datasets (
        id           INTEGER PRIMARY KEY,
        datapack_id  INTEGER NOT NULL REFERENCES datapacks(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        category     TEXT,
        sub_category TEXT,
        language     TEXT,
        origin_json  TEXT,
        note         TEXT,
        source       TEXT NOT NULL DEFAULT 'excel' CHECK (source IN ('excel', 'hf', 'user')),
        hf_repo      TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (datapack_id, name)
      );
      CREATE INDEX datasets_category_idx ON datasets(category);

      CREATE TABLE variants (
        id                 INTEGER PRIMARY KEY,
        dataset_id         INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
        kind               TEXT NOT NULL CHECK (kind IN ('longer', 'longans', 'shortans', 'default')),
        json_path          TEXT,
        n_samples_manifest INTEGER,
        sft_weight         REAL,
        index_status       TEXT NOT NULL DEFAULT 'none'
                           CHECK (index_status IN ('none', 'queued', 'running', 'done', 'error')),
        n_samples_indexed  INTEGER NOT NULL DEFAULT 0,
        indexed_at         TEXT,
        file_mtime         TEXT,
        index_error        TEXT,
        UNIQUE (dataset_id, kind)
      );

      -- Which datapacks a superpack is composed of.
      CREATE TABLE superpack_datapacks (
        superpack_id INTEGER NOT NULL REFERENCES superpacks(id) ON DELETE CASCADE,
        datapack_id  INTEGER NOT NULL REFERENCES datapacks(id) ON DELETE CASCADE,
        position     INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (superpack_id, datapack_id)
      );

      -- Per-superpack mix weights and the manifest's aggregate columns for each dataset row.
      CREATE TABLE superpack_dataset_weights (
        superpack_id INTEGER NOT NULL REFERENCES superpacks(id) ON DELETE CASCADE,
        dataset_id   INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
        mx_weight_1  REAL,
        mx_weight_2  REAL,
        n_total      INTEGER,
        n_training   INTEGER,
        n_mx1        INTEGER,
        n_mx2        INTEGER,
        PRIMARY KEY (superpack_id, dataset_id)
      );

      CREATE TABLE tags (
        id    INTEGER PRIMARY KEY,
        name  TEXT NOT NULL UNIQUE,
        color TEXT
      );

      CREATE TABLE taggings (
        tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK (target_type IN ('datapack', 'dataset')),
        target_id   INTEGER NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (tag_id, target_type, target_id)
      );
      CREATE INDEX taggings_target_idx ON taggings(target_type, target_id);

      CREATE TABLE samples (
        id                   INTEGER PRIMARY KEY,
        variant_id           INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
        sample_id            TEXT,
        image_paths          TEXT NOT NULL DEFAULT '[]',
        n_images             INTEGER NOT NULL DEFAULT 0,
        n_turns              INTEGER NOT NULL DEFAULT 0,
        has_system           INTEGER NOT NULL DEFAULT 0,
        first_question       TEXT,
        first_answer_preview TEXT,
        q_chars              INTEGER NOT NULL DEFAULT 0,
        a_chars              INTEGER NOT NULL DEFAULT 0,
        meta                 TEXT,
        conversations        TEXT NOT NULL
      );
      CREATE INDEX samples_variant_idx ON samples(variant_id, id);
      CREATE INDEX samples_variant_sample_idx ON samples(variant_id, sample_id);

      CREATE VIRTUAL TABLE samples_fts USING fts5(first_question, answer_text);

      CREATE TABLE jobs (
        id          INTEGER PRIMARY KEY,
        type        TEXT NOT NULL CHECK (type IN ('index', 'hf_inspect', 'hf_import', 'excel_import')),
        status      TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'done', 'error', 'cancelled')),
        progress    REAL NOT NULL DEFAULT 0,
        message     TEXT,
        payload     TEXT,
        result      TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        started_at  TEXT,
        finished_at TEXT
      );
      CREATE INDEX jobs_status_idx ON jobs(status, created_at);

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `,
  },
];
