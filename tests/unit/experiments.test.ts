// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { migrate, openDatabase } from "@/lib/db/client";
import { MIGRATIONS } from "@/lib/db/migrations";
import { parseTrainingConfig } from "@/lib/experiments/config";
import { normalizeSpec, parseDatasetInfo, toRawSample } from "@/lib/experiments/format";
import { normalizeRootPath, scanRoot, upsertRoot } from "@/lib/experiments/scan";
import { deriveSample } from "@/lib/indexer/derive";
import { indexVariant } from "@/lib/indexer/index-variant";
import { experimentsUsingDataset, getExperiment, listExperiments } from "@/lib/queries/experiments";
import { liveQuestionAnswers } from "@/lib/queries/samples";

const SHAREGPT_ENTRY = {
  formatting: "sharegpt",
  columns: { messages: "conversations", images: "image" },
  tags: {
    role_tag: "from",
    content_tag: "value",
    user_tag: "human",
    assistant_tag: "gpt",
    system_tag: "system",
    observation_tag: "tool",
  },
};

const BASE_YAML = `
model_name_or_path: /group-volume/lit/model/sr-model/Gauss4/LMM_SFT/gauss4_ablation_v28/checkpoint-20000
# resume_from_checkpoint: {YOUR_CHECKPOINT_LOCATION}
template: gauss4_ultravit
output_dir: /group-volume/save/gauss4_test_32k
### method
stage: sft
finetuning_type: full
### dataset
dataset_dir: .
dataset: baseline_gemma, baseline_ultra
eval_dataset: missing_key
cutoff_len: 32768
media_dir: /group-volume/lit/data/sr-llava/finetune/image_folder
learning_rate: 5.0e-5
num_train_epochs: 3.0
`;

describe("dataset_info format", () => {
  it("maps sharegpt rows with custom role tags onto LLaVA turns", () => {
    const spec = normalizeSpec({
      formatting: "sharegpt",
      columns: { messages: "messages", images: "images", system: "sys" },
      tags: {
        role_tag: "role",
        content_tag: "content",
        user_tag: "user",
        assistant_tag: "assistant",
      },
    });
    const raw = toRawSample(
      {
        id: 3,
        sys: "be brief",
        images: ["a.jpg"],
        messages: [
          { role: "user", content: "<image>Q?" },
          { role: "assistant", content: "A." },
        ],
        source: "x",
      },
      spec,
    );
    const d = deriveSample(raw);
    expect(d.conversations.map((t) => t.from)).toEqual(["system", "human", "gpt"]);
    expect(d.firstQuestion).toBe("Q?");
    expect(d.imagePaths).toEqual(["a.jpg"]);
    expect(d.sampleId).toBe("3");
    expect(d.meta).toEqual({ source: "x" });
  });

  it("maps alpaca rows (history, instruction + input, output)", () => {
    // Like LLaMA-Factory, `history` is only read when the entry names the column.
    const spec = normalizeSpec({ columns: { history: "history" } });
    const d = deriveSample(
      toRawSample(
        { instruction: "Translate", input: "hi", output: "안녕", history: [["q0", "a0"]] },
        spec,
      ),
    );
    expect(d.conversations).toEqual([
      { from: "human", value: "q0" },
      { from: "gpt", value: "a0" },
      { from: "human", value: "Translate\nhi" },
      { from: "gpt", value: "안녕" },
    ]);
  });

  it("keeps chosen/rejected of ranking data as meta", () => {
    const spec = normalizeSpec({ ...SHAREGPT_ENTRY, ranking: true });
    spec.columns.chosen = "chosen";
    spec.columns.rejected = "rejected";
    const d = deriveSample(
      toRawSample(
        {
          conversations: [{ from: "human", value: "Q" }],
          chosen: { from: "gpt", value: "good" },
          rejected: { from: "gpt", value: "bad" },
        },
        spec,
      ),
    );
    expect(d.nTurns).toBe(1);
    expect(d.meta).toEqual({ chosen: "good", rejected: "bad" });
  });

  it("parses the registry, skipping non-object entries", () => {
    const entries = parseDatasetInfo({
      a: { file_name: "a.jsonl", ...SHAREGPT_ENTRY },
      b: { hf_hub_url: "org/b" },
      c: "nope",
    });
    expect(entries.map((e) => e.key)).toEqual(["a", "b"]);
    expect(entries[0].spec.tags.observation_tag).toBe("tool");
    expect(entries[1]).toMatchObject({ fileName: null, remote: "org/b" });
    expect(entries[1].spec.formatting).toBe("alpaca");
  });

  it("reads the training YAML fields and the comma-separated dataset list", () => {
    const cfg = parseTrainingConfig(BASE_YAML)!;
    expect(cfg.datasets).toEqual(["baseline_gemma", "baseline_ultra"]);
    expect(cfg.evalDatasets).toEqual(["missing_key"]);
    expect(cfg).toMatchObject({
      stage: "sft",
      template: "gauss4_ultravit",
      cutoffLen: 32768,
      learningRate: 5e-5,
      numTrainEpochs: 3,
      datasetDir: ".",
    });
    expect(parseTrainingConfig("train_batch_size: 8\nzero_optimization: {}\n")).toBeNull();
    expect(parseTrainingConfig(": : not yaml [")).toBeNull();
  });

  it("normalises root input", () => {
    expect(normalizeRootPath(" /a/b/ ")).toBe("/a/b");
    expect(normalizeRootPath("/a/b/dataset_info.json")).toBe("/a/b");
  });
});

describe("migration 0002", () => {
  it("keeps existing datasets, variants and jobs when rebuilding tables", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)`);
    db.exec(MIGRATIONS[0].sql);
    db.prepare(`INSERT INTO schema_migrations (name) VALUES (?)`).run(MIGRATIONS[0].name);
    db.exec(`INSERT INTO datapacks (id, name) VALUES (1, 'p')`);
    db.exec(`INSERT INTO datasets (id, datapack_id, name, source) VALUES (7, 1, 'd', 'hf')`);
    db.exec(
      `INSERT INTO variants (id, dataset_id, kind, json_path) VALUES (9, 7, 'longer', '/x.json')`,
    );
    db.exec(`INSERT INTO jobs (type, status) VALUES ('index', 'done')`);

    migrate(db);

    expect(db.prepare(`SELECT id, source FROM datasets`).all()).toEqual([{ id: 7, source: "hf" }]);
    expect(db.prepare(`SELECT id, dataset_id FROM variants`).all()).toEqual([
      { id: 9, dataset_id: 7 },
    ]);
    expect(db.prepare(`SELECT count(*) AS n FROM jobs`).get()).toEqual({ n: 1 });
    // New CHECK values are accepted and the FK still cascades.
    db.exec(`INSERT INTO datasets (datapack_id, name, source) VALUES (1, 'f', 'file')`);
    db.exec(`INSERT INTO jobs (type) VALUES ('scan')`);
    db.exec(`DELETE FROM datasets WHERE id = 7`);
    expect(db.prepare(`SELECT count(*) AS n FROM variants`).get()).toEqual({ n: 0 });
    expect(db.prepare(`PRAGMA foreign_keys`).get()).toEqual({ foreign_keys: 1 });
  });
});

function sharegptLine(i: number): string {
  return JSON.stringify({
    id: `s${i}`,
    image: i % 2 ? `imgs/${i}.jpg` : undefined,
    conversations: [
      { from: "system", value: "sys" },
      { from: "human", value: `<image>\nquestion ${i}` },
      { from: "gpt", value: `answer ${i}` },
    ],
  });
}

/** A root shaped like scripts/training/exp260710/length_ablation_v6 + a jsonl folder. */
function makeRoot() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "sft-exp-"));
  const root = path.join(base, "scripts", "training");
  const exp = path.join(root, "exp260710", "length_ablation_v6");
  const jsonl = path.join(base, "jsonl");
  fs.mkdirSync(exp, { recursive: true });
  fs.mkdirSync(path.join(exp, "checkpoint-100"), { recursive: true });
  fs.mkdirSync(jsonl, { recursive: true });

  fs.writeFileSync(
    path.join(jsonl, "datapack_gemma.jsonl"),
    [sharegptLine(0), sharegptLine(1), "{broken", "", sharegptLine(2)].join("\n") + "\n",
  );
  // A .json file in JSON Lines layout, referenced relative to the registry.
  fs.writeFileSync(path.join(exp, "local.json"), [sharegptLine(5), sharegptLine(6)].join("\n"));

  fs.writeFileSync(
    path.join(exp, "dataset_info.json"),
    JSON.stringify({
      baseline_gemma: { file_name: path.join(jsonl, "datapack_gemma.jsonl"), ...SHAREGPT_ENTRY },
      baseline_ultra: { file_name: "local.json", ...SHAREGPT_ENTRY },
      gone: { file_name: path.join(jsonl, "nope.jsonl"), ...SHAREGPT_ENTRY },
      defined_mpo_dataset_name: {
        file_name: "{jsonl file that you made by merge_data_file.py}",
        ranking: true,
        ...SHAREGPT_ENTRY,
      },
    }),
  );
  fs.writeFileSync(path.join(exp, "base.yaml"), BASE_YAML);
  fs.writeFileSync(
    path.join(exp, "short.yaml"),
    "stage: sft\ndataset: baseline_gemma\ncutoff_len: 8192\n",
  );
  fs.writeFileSync(path.join(exp, "accelerate.yaml"), "num_processes: 8\n");
  fs.writeFileSync(path.join(exp, "checkpoint-100", "skip.yaml"), "dataset: baseline_gemma\n");
  return { base, root, exp, jsonl };
}

describe("scanRoot", () => {
  it("registers configs, registries and data files, then indexes JSONL", async () => {
    const { root, jsonl } = makeRoot();
    const db = openDatabase(":memory:");
    const rootId = upsertRoot(db, root);
    const result = await scanRoot(db, rootId);
    expect(result).toMatchObject({ nInfos: 1, nConfigs: 2, nFiles: 2, nMissing: 1 });

    const exps = listExperiments(db, { rootId });
    expect(exps.map((e) => e.name)).toEqual([
      "exp260710/length_ablation_v6/base",
      "exp260710/length_ablation_v6/short",
    ]);
    const base = exps[0];
    expect(base.dir).toBe("exp260710/length_ablation_v6");
    expect(base.cutoffLen).toBe(32768);
    expect(base.datasets.map((d) => [d.split, d.key, d.fileStatus])).toEqual([
      ["train", "baseline_gemma", "ok"],
      ["train", "baseline_ultra", "ok"],
      ["eval", "missing_key", null],
    ]);

    const gemma = base.datasets[0];
    expect(gemma.datasetName).toBe("datapack_gemma.jsonl");
    const indexed = await indexVariant(db, gemma.variantId!);
    expect(indexed).toMatchObject({ nSamples: 3, badLines: 1 });
    const sample = db
      .prepare(
        `SELECT n_turns, has_system, first_question, image_paths FROM samples WHERE sample_id = 's1'`,
      )
      .get();
    expect(sample).toEqual({
      n_turns: 1,
      has_system: 1,
      first_question: "question 1",
      image_paths: '["imgs/1.jpg"]',
    });
    const v = db
      .prepare(`SELECT index_status, index_error FROM variants WHERE id = ?`)
      .get(gemma.variantId!) as { index_status: string; index_error: string };
    expect(v.index_status).toBe("done");
    expect(v.index_error).toContain("1개");

    // The table view's GT column is read live from the file at the stored byte offsets.
    const ids = (
      db
        .prepare(`SELECT id FROM samples WHERE variant_id = ? ORDER BY id`)
        .all(gemma.variantId!) as {
        id: number;
      }[]
    ).map((r) => r.id);
    expect(Object.values(liveQuestionAnswers(db, ids)).map((x) => x.answer)).toEqual([
      "answer 0",
      "answer 1",
      "answer 2",
    ]);

    const ultra = base.datasets[1];
    expect((await indexVariant(db, ultra.variantId!)).nSamples).toBe(2);

    // Both configs use baseline_gemma.
    expect(experimentsUsingDataset(db, gemma.datasetId!).map((e) => e.name)).toEqual([
      "exp260710/length_ablation_v6/base",
      "exp260710/length_ablation_v6/short",
    ]);

    const detail = getExperiment(db, base.id)!;
    expect(detail.registry.map((r) => [r.key, r.fileStatus])).toEqual([
      ["baseline_gemma", "ok"],
      ["baseline_ultra", "ok"],
      ["gone", "missing"],
      ["defined_mpo_dataset_name", "none"],
    ]);
    expect(detail.siblings.map((s) => s.name)).toEqual(["exp260710/length_ablation_v6/short"]);
    expect(detail.datasets[0].datasetName).toBe("datapack_gemma.jsonl");
    expect(path.dirname(detail.datasets[0].resolvedPath!)).toBe(jsonl);

    // Rescan: same ids, the unchanged file keeps its index; removed configs disappear.
    fs.rmSync(path.join(root, "exp260710", "length_ablation_v6", "short.yaml"));
    await scanRoot(db, rootId);
    const again = listExperiments(db, { rootId });
    expect(again.map((e) => e.id)).toEqual([base.id]);
    expect(again[0].datasets[0]).toMatchObject({ indexStatus: "done", nIndexed: 3 });
  });

  it("finds the registry via dataset_dir or an ancestor directory", async () => {
    const { root, exp } = makeRoot();
    const runs = path.join(root, "other", "runs_v2");
    fs.mkdirSync(runs, { recursive: true });
    fs.writeFileSync(path.join(runs, "a.yaml"), `dataset: baseline_gemma\ndataset_dir: ${exp}\n`);
    fs.writeFileSync(path.join(runs, "b.yaml"), "dataset: baseline_gemma\n");
    const db = openDatabase(":memory:");
    const rootId = upsertRoot(db, root);
    const r = await scanRoot(db, rootId);
    const byName = new Map(listExperiments(db, { rootId }).map((e) => [e.name, e]));
    expect(byName.get("other/runs_v2/a")!.datasets[0].fileStatus).toBe("ok");
    expect(byName.get("other/runs_v2/b")!.infoPath).toBeNull();
    expect(r.warnings.some((w) => w.includes("other/runs_v2/b.yaml"))).toBe(true);
  });

  it("finds LLaMA-Factory's default data/dataset_info.json from examples/*", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "sft-lf-"));
    fs.mkdirSync(path.join(base, "data"));
    fs.mkdirSync(path.join(base, "examples", "train_full"), { recursive: true });
    fs.writeFileSync(path.join(base, "data", "a.jsonl"), sharegptLine(0) + "\n");
    fs.writeFileSync(
      path.join(base, "data", "dataset_info.json"),
      JSON.stringify({ a: { file_name: "a.jsonl", ...SHAREGPT_ENTRY } }),
    );
    fs.writeFileSync(path.join(base, "examples", "train_full", "x.yaml"), "dataset: a\n");
    const db = openDatabase(":memory:");
    const rootId = upsertRoot(db, base);
    await scanRoot(db, rootId);
    const [e] = listExperiments(db, { rootId });
    expect(e.infoPath).toBe(path.join(base, "data", "dataset_info.json"));
    expect(e.datasets[0].fileStatus).toBe("ok");
  });

  it("keeps one dataset per format when registries read the same file differently", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "sft-spec-"));
    fs.writeFileSync(path.join(base, "a.jsonl"), sharegptLine(0) + "\n");
    fs.writeFileSync(path.join(base, "b.parquet"), "PAR1");
    fs.writeFileSync(
      path.join(base, "dataset_info.json"),
      JSON.stringify({
        sft: { file_name: "a.jsonl", ...SHAREGPT_ENTRY },
        dpo: { file_name: "a.jsonl", ...SHAREGPT_ENTRY, ranking: true },
        hub: { file_name: "a.jsonl", hf_hub_url: "org/x" },
        pq: { file_name: "b.parquet" },
      }),
    );
    fs.writeFileSync(path.join(base, "run.yaml"), "dataset: sft,dpo,hub,pq\n");
    const db = openDatabase(":memory:");
    const rootId = upsertRoot(db, base);
    await scanRoot(db, rootId);
    const ds = listExperiments(db, { rootId })[0].datasets;
    expect(ds.map((d) => d.fileStatus)).toEqual(["ok", "ok", "remote", "unsupported"]);
    expect(ds[0].datasetId).not.toBe(ds[1].datasetId);
    await indexVariant(db, ds[0].variantId!);
    await scanRoot(db, rootId);
    const again = listExperiments(db, { rootId })[0].datasets;
    expect(again[0]).toMatchObject({
      datasetId: ds[0].datasetId,
      indexStatus: "done",
      nIndexed: 1,
    });
  });

  it("drops stale samples when a file's format changes", async () => {
    const { root, exp } = makeRoot();
    const db = openDatabase(":memory:");
    const rootId = upsertRoot(db, root);
    await scanRoot(db, rootId);
    const gemma = listExperiments(db, { rootId })[0].datasets[0];
    await indexVariant(db, gemma.variantId!);
    const infoFile = path.join(exp, "dataset_info.json");
    const info = JSON.parse(fs.readFileSync(infoFile, "utf8"));
    info.baseline_gemma.tags.user_tag = "user";
    fs.writeFileSync(infoFile, JSON.stringify(info));
    await scanRoot(db, rootId);
    const after = listExperiments(db, { rootId })[0].datasets[0];
    expect(after).toMatchObject({ datasetId: gemma.datasetId, indexStatus: "none", nIndexed: 0 });
    expect(
      db.prepare(`SELECT count(*) AS n FROM samples WHERE variant_id = ?`).get(gemma.variantId!),
    ).toEqual({ n: 0 });
  });

  it("reports a missing root directory", async () => {
    const db = openDatabase(":memory:");
    const rootId = upsertRoot(db, "/definitely/not/here");
    await expect(scanRoot(db, rootId)).rejects.toThrow("디렉터리를 찾을 수 없습니다");
  });
});
