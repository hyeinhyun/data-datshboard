import path from "node:path";

/**
 * Server-side configuration read from environment variables (see .env.example).
 * Values are resolved once at import time; restart the server after changing them.
 */
function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

const DATA_DIR = path.resolve(str("DATA_DIR", "./data"));

export const env = {
  DATA_DIR,
  DATABASE_PATH: str("DATABASE_PATH", path.join(DATA_DIR, "app.db")),
  THUMB_DIR: path.join(DATA_DIR, "thumbs"),
  EXPORT_DIR: path.join(DATA_DIR, "exports"),
  UPLOAD_DIR: path.join(DATA_DIR, "uploads"),
  PATH_PREFIX_FROM: str("PATH_PREFIX_FROM", ""),
  PATH_PREFIX_TO: str("PATH_PREFIX_TO", ""),
  IMAGE_ROOT: str("IMAGE_ROOT", "/group-volume/lit/data/sr-llava/finetune/image_folder"),
  OUTPUT_ROOT: str("OUTPUT_ROOT", "/group-volume/lit/data/sr-llava/finetune/json/hf_imports"),
  HF_TOKEN: str("HF_TOKEN", ""),
  PYTHON_BIN: str("PYTHON_BIN", "./workers/.venv/bin/python"),
  WORKERS_DIR: path.resolve(str("WORKERS_DIR", "./workers")),
};

/** Rewrites a manifest path from the volume prefix to where it is mounted here. */
export function remapPath(p: string): string {
  const { PATH_PREFIX_FROM, PATH_PREFIX_TO } = env;
  if (!PATH_PREFIX_FROM || PATH_PREFIX_FROM === PATH_PREFIX_TO) return p;
  return p.startsWith(PATH_PREFIX_FROM) ? PATH_PREFIX_TO + p.slice(PATH_PREFIX_FROM.length) : p;
}
