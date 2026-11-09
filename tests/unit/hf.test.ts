// @vitest-environment node
import { describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { hfOutputPaths, registerHfDataset } from "@/lib/hf/import-job";
import { defaultDatasetName, normalizeRepoId, parseEventLine } from "@/lib/hf/python";

describe("hf helpers", () => {
  it("normalises repo references", () => {
    expect(normalizeRepoId("TIGER-Lab/ViRL39K")).toBe("TIGER-Lab/ViRL39K");
    expect(normalizeRepoId("https://huggingface.co/datasets/TIGER-Lab/ViRL39K")).toBe(
      "TIGER-Lab/ViRL39K",
    );
    expect(
      normalizeRepoId("https://huggingface.co/datasets/TIGER-Lab/ViRL39K/tree/main"),
    ).toBeNull();
    expect(normalizeRepoId("not a repo")).toBeNull();
    expect(defaultDatasetName("TIGER-Lab/ViRL39K")).toBe("ViRL39K");
  });

  it("parses worker JSON lines and ignores noise", () => {
    expect(
      parseEventLine('{"event":"progress","done":100,"total":null,"images":50,"missing_images":0}'),
    ).toMatchObject({
      event: "progress",
      done: 100,
    });
    expect(parseEventLine("Downloading 12%")).toBeNull();
    expect(parseEventLine('{"no_event":1}')).toBeNull();
    expect(parseEventLine("{broken")).toBeNull();
  });

  it("derives output paths and registers the converted dataset with a default variant", () => {
    const paths = hfOutputPaths("My Set/v1");
    expect(paths.safe).toBe("My_Set_v1");
    expect(paths.imageRelPrefix).toBe("hf_imports/My_Set_v1");

    const db = openDatabase(":memory:");
    const payload = {
      repo: "org/name",
      config: null,
      split: "train",
      mapping: {
        question: "q",
        answer: "a",
        image: null,
        id: null,
        system: null,
        conversations: null,
        meta: [],
        normalize_tokens: true,
      },
      maxSamples: null,
      imageMode: "all" as const,
      datasetName: "name",
      datapackName: "hf",
      category: "General VQA",
      subCategory: null,
      language: "en",
      note: null,
    };
    const ids = registerHfDataset(db, payload, "/out/name.json", 123);
    const v = db
      .prepare(`SELECT kind, json_path, n_samples_manifest FROM variants WHERE id = ?`)
      .get(ids.variantId) as {
      kind: string;
      json_path: string;
      n_samples_manifest: number;
    };
    expect(v).toEqual({ kind: "default", json_path: "/out/name.json", n_samples_manifest: 123 });
    const d = db
      .prepare(`SELECT source, hf_repo FROM datasets WHERE id = ?`)
      .get(ids.datasetId) as { source: string; hf_repo: string };
    expect(d).toEqual({ source: "hf", hf_repo: "org/name" });

    // Re-running replaces the variant path instead of duplicating the dataset.
    const again = registerHfDataset(db, payload, "/out/name2.json", 200);
    expect(again.datasetId).toBe(ids.datasetId);
    expect((db.prepare(`SELECT count(*) c FROM datasets`).get() as { c: number }).c).toBe(1);
  });
});
