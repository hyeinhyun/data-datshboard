// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { registerFileDataset } from "@/lib/experiments/scan";
import { detectFormat, expandPaths, inspectFile, splitPaths } from "@/lib/files/detect";
import { deriveSample } from "@/lib/indexer/derive";
import { indexVariant } from "@/lib/indexer/index-variant";
import { toRawSample } from "@/lib/experiments/format";

describe("splitPaths", () => {
  it("splits on commas and newlines, trims quotes and drops duplicates", () => {
    expect(splitPaths(` "/a/x.jsonl", /b/y.json\n/a/x.jsonl\n\n'/c' `)).toEqual([
      "/a/x.jsonl",
      "/b/y.json",
      "/c",
    ]);
  });
});

describe("detectFormat", () => {
  it("recognises LLaVA rows (read as is)", () => {
    const d = detectFormat({ image: "a.jpg", conversations: [{ from: "human", value: "Q" }] });
    expect(d).toMatchObject({ spec: null });
  });

  it("recognises OpenAI-style messages with content parts", () => {
    const row = {
      images: ["a.jpg"],
      messages: [
        { role: "user", content: [{ type: "image" }, { type: "text", text: "What?" }] },
        { role: "assistant", content: "This." },
      ],
    };
    const d = detectFormat(row);
    if ("error" in d) throw new Error(d.error);
    expect(d.format).toContain("OpenAI");
    const s = deriveSample(toRawSample(row, d.spec!));
    expect(s.firstQuestion).toBe("What?");
    expect(s.firstAnswerPreview).toBe("This.");
    expect(s.imagePaths).toEqual(["a.jpg"]);
  });

  it("recognises question/answer and instruction/output rows", () => {
    const qa = detectFormat({ question: "1+1?", answer: "2", image: "m.png" });
    if ("error" in qa) throw new Error(qa.error);
    const s = deriveSample(
      toRawSample({ question: "1+1?", answer: "2", image: "m.png" }, qa.spec!),
    );
    expect([s.firstQuestion, s.firstAnswerPreview, s.nImages]).toEqual(["1+1?", "2", 1]);

    const alpaca = detectFormat({ instruction: "Do", input: "x", output: "y" });
    if ("error" in alpaca) throw new Error(alpaca.error);
    expect(alpaca.spec!.columns).toMatchObject({
      prompt: "instruction",
      query: "input",
      response: "output",
    });
  });

  it("explains unknown shapes", () => {
    expect(detectFormat({ foo: 1, bar: 2 })).toEqual({
      error: "형식을 알 수 없습니다 (키: foo, bar)",
    });
  });
});

describe("file import", () => {
  it("expands directories, inspects files and indexes the registered dataset", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sft-files-"));
    fs.mkdirSync(path.join(dir, "sub"));
    const qa = [1, 2, 3].map((i) => JSON.stringify({ id: i, question: `q${i}`, answer: `a${i}` }));
    fs.writeFileSync(path.join(dir, "sub", "qa.jsonl"), qa.join("\n"));
    fs.writeFileSync(
      path.join(dir, "llava.json"),
      JSON.stringify([
        {
          id: "x",
          conversations: [
            { from: "human", value: "hi" },
            { from: "gpt", value: "yo" },
          ],
        },
      ]),
    );
    fs.writeFileSync(path.join(dir, "dataset_info.json"), "{}");
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");

    const { files } = await expandPaths([dir, path.join(dir, "missing.jsonl")]);
    expect(files).toEqual([
      path.join(dir, "llava.json"),
      path.join(dir, "sub", "qa.jsonl"),
      path.join(dir, "missing.jsonl"),
    ]);

    const [llava, jsonl, missing] = await Promise.all(files.map((f) => inspectFile(f)));
    expect(llava).toMatchObject({ status: "ok", layout: "array", spec: null });
    expect(llava.preview).toMatchObject({ question: "hi", answer: "yo" });
    expect(jsonl).toMatchObject({ status: "ok", layout: "lines" });
    expect(missing.status).toBe("missing");

    const db = openDatabase(":memory:");
    const datasetId = registerFileDataset(
      db,
      jsonl.path,
      JSON.stringify(jsonl.spec),
      false,
      "my pack",
    );
    const v = db
      .prepare(
        `SELECT v.id, p.name AS pack FROM variants v JOIN datasets d ON d.id = v.dataset_id
                JOIN datapacks p ON p.id = d.datapack_id WHERE d.id = ?`,
      )
      .get(datasetId) as { id: number; pack: string };
    expect(v.pack).toBe("my pack");
    expect((await indexVariant(db, v.id)).nSamples).toBe(3);
    expect(db.prepare(`SELECT first_question FROM samples ORDER BY id LIMIT 1`).get()).toEqual({
      first_question: "q1",
    });
  });
});
