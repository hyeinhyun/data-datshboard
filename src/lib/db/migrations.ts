/**
 * Ordered schema migrations. Each entry runs once, inside a transaction, and is
 * recorded in `schema_migrations`. Append new entries; never edit old ones.
 *
 * `foreignKeysOff` runs the migration with foreign key enforcement disabled, which
 * SQLite requires for rebuilding a table (to change a CHECK constraint) that other
 * tables reference; without it, dropping the old table would cascade-delete rows.
 */
export const MIGRATIONS: {
  name: string;
  sql: string;
  /** Tables whose foreign keys are checked before commit (only these; older orphans elsewhere are not this migration's concern). */
  foreignKeysOff?: string[];
}[] = [
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
  {
    // LLaMA-Factory experiments: dataset_info.json registries, training YAML configs,
    // and JSON/JSONL data files registered as datasets (source = 'file').
    name: "0002_experiments",
    foreignKeysOff: ["variants", "superpack_dataset_weights"],
    sql: `
      CREATE TABLE datasets_new (
        id           INTEGER PRIMARY KEY,
        datapack_id  INTEGER NOT NULL REFERENCES datapacks(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        category     TEXT,
        sub_category TEXT,
        language     TEXT,
        origin_json  TEXT,
        note         TEXT,
        source       TEXT NOT NULL DEFAULT 'excel' CHECK (source IN ('excel', 'hf', 'user', 'file')),
        hf_repo      TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (datapack_id, name)
      );
      INSERT INTO datasets_new (id, datapack_id, name, category, sub_category, language, origin_json,
                                note, source, hf_repo, created_at, updated_at)
        SELECT id, datapack_id, name, category, sub_category, language, origin_json,
               note, source, hf_repo, created_at, updated_at FROM datasets;
      DROP TABLE datasets;
      ALTER TABLE datasets_new RENAME TO datasets;
      CREATE INDEX datasets_category_idx ON datasets(category);

      CREATE TABLE jobs_new (
        id          INTEGER PRIMARY KEY,
        type        TEXT NOT NULL CHECK (type IN ('index', 'hf_inspect', 'hf_import', 'excel_import', 'scan')),
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
      INSERT INTO jobs_new SELECT id, type, status, progress, message, payload, result,
                                  created_at, started_at, finished_at FROM jobs;
      DROP TABLE jobs;
      ALTER TABLE jobs_new RENAME TO jobs;
      CREATE INDEX jobs_status_idx ON jobs(status, created_at);

      -- How to turn a row of the data file into a conversation (LLaMA-Factory dataset_info
      -- entry: formatting, columns, tags, ranking). NULL means the file is already LLaVA format.
      ALTER TABLE variants ADD COLUMN format_spec TEXT;

      CREATE TABLE experiment_roots (
        id         INTEGER PRIMARY KEY,
        path       TEXT NOT NULL UNIQUE,
        scanned_at TEXT,
        n_infos    INTEGER NOT NULL DEFAULT 0,
        n_configs  INTEGER NOT NULL DEFAULT 0,
        error      TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE dataset_infos (
        id         INTEGER PRIMARY KEY,
        root_id    INTEGER NOT NULL REFERENCES experiment_roots(id) ON DELETE CASCADE,
        path       TEXT NOT NULL UNIQUE,
        n_entries  INTEGER NOT NULL DEFAULT 0,
        file_mtime TEXT,
        error      TEXT
      );

      CREATE TABLE dataset_info_entries (
        id            INTEGER PRIMARY KEY,
        info_id       INTEGER NOT NULL REFERENCES dataset_infos(id) ON DELETE CASCADE,
        key           TEXT NOT NULL,
        file_name     TEXT,
        resolved_path TEXT,
        formatting    TEXT,
        ranking       INTEGER NOT NULL DEFAULT 0,
        spec          TEXT NOT NULL,
        file_status   TEXT NOT NULL CHECK (file_status IN ('ok', 'missing', 'directory', 'remote', 'none', 'unsupported')),
        file_size     INTEGER,
        file_mtime    TEXT,
        dataset_id    INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
        UNIQUE (info_id, key)
      );
      CREATE INDEX dataset_info_entries_dataset_idx ON dataset_info_entries(dataset_id);

      CREATE TABLE experiments (
        id                INTEGER PRIMARY KEY,
        root_id           INTEGER NOT NULL REFERENCES experiment_roots(id) ON DELETE CASCADE,
        config_path       TEXT NOT NULL UNIQUE,
        dir               TEXT NOT NULL,
        name              TEXT NOT NULL,
        info_id           INTEGER REFERENCES dataset_infos(id) ON DELETE SET NULL,
        stage             TEXT,
        finetuning_type   TEXT,
        model_name_or_path TEXT,
        output_dir        TEXT,
        template          TEXT,
        cutoff_len        INTEGER,
        learning_rate     REAL,
        num_train_epochs  REAL,
        media_dir         TEXT,
        dataset_dir       TEXT,
        config            TEXT NOT NULL,
        file_mtime        TEXT,
        scanned_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX experiments_root_idx ON experiments(root_id, dir);

      -- Datasets named in a config (dataset: a,b / eval_dataset: c), in order. Resolved
      -- through (experiments.info_id, key) at read time so a rescan of the registry keeps links.
      CREATE TABLE experiment_datasets (
        experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
        split         TEXT NOT NULL CHECK (split IN ('train', 'eval')),
        position      INTEGER NOT NULL,
        key           TEXT NOT NULL,
        PRIMARY KEY (experiment_id, split, position)
      );
      CREATE INDEX experiment_datasets_key_idx ON experiment_datasets(key);
    `,
  },
  {
    // Samples no longer copy the conversation: they record where the record sits in the
    // data file (byte offset + length) and the conversation is read from the file when a
    // sample is opened. Search covers the first question only. Existing indexes are
    // dropped (they are derived data) and their variants need re-indexing.
    name: "0003_sample_offsets",
    sql: `
      DROP TABLE samples_fts;
      DROP TABLE samples;
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
        byte_offset          INTEGER NOT NULL,
        byte_length          INTEGER NOT NULL
      );
      CREATE INDEX samples_variant_idx ON samples(variant_id, id);
      CREATE INDEX samples_variant_sample_idx ON samples(variant_id, sample_id);
      CREATE VIRTUAL TABLE samples_fts USING fts5(first_question);
      UPDATE variants SET index_status = 'none', n_samples_indexed = 0, indexed_at = NULL,
        file_mtime = NULL, index_error = NULL
      WHERE index_status IN ('done', 'error', 'running');
    `,
  },
];
