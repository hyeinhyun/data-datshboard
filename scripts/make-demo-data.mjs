#!/usr/bin/env node
/**
 * Generates a small local demo dataset so the dashboard can be exercised without
 * access to /group-volume:
 *   data/samples/demo/images/*.png           synthetic chart-like images
 *   data/samples/demo/demo_longans.json      LLaVA-format samples (multi-turn, with images)
 *   data/samples/demo/demo_shortans.json     short-answer variant
 *   data/samples/demo/demo_text.json         text-only dataset (no images)
 *   data/samples/manifest_local_demo.tsv     manifest pointing at the files above
 *
 * Usage: node scripts/make-demo-data.mjs [--samples 300]
 */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const args = process.argv.slice(2);
const N = Number(args[args.indexOf("--samples") + 1]) || 300;
const ROOT = path.resolve("data/samples/demo");
const IMG = path.join(ROOT, "images", "demo_set");
fs.mkdirSync(IMG, { recursive: true });

const CATEGORIES = ["bar", "line", "pie", "table"];
const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

function svgChart(i) {
  const kind = CATEGORIES[i % CATEGORIES.length];
  const bars = Array.from({ length: 5 }, (_, k) => 20 + ((i * 37 + k * 53) % 140));
  let body = "";
  if (kind === "bar") {
    body = bars
      .map(
        (h, k) =>
          `<rect x="${40 + k * 56}" y="${200 - h}" width="40" height="${h}" fill="${COLORS[k]}"/>`,
      )
      .join("");
  } else if (kind === "line") {
    const pts = bars.map((h, k) => `${40 + k * 60},${200 - h}`).join(" ");
    body = `<polyline points="${pts}" fill="none" stroke="${COLORS[i % 6]}" stroke-width="4"/>`;
  } else if (kind === "pie") {
    body = bars
      .map((h, k) => `<circle cx="160" cy="120" r="${90 - k * 15}" fill="${COLORS[k]}"/>`)
      .join("");
  } else {
    body = Array.from({ length: 4 }, (_, r) =>
      Array.from(
        { length: 3 },
        (_, c) =>
          `<rect x="${40 + c * 80}" y="${40 + r * 40}" width="76" height="36" fill="${r === 0 ? "#333" : "#eee"}" stroke="#999"/>`,
      ).join(""),
    ).join("");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
    <rect width="320" height="240" fill="white"/>
    <text x="12" y="24" font-family="sans-serif" font-size="14" fill="#333">demo ${kind} #${i}</text>
    ${body}
    <line x1="30" y1="200" x2="300" y2="200" stroke="#666"/>
  </svg>`;
}

async function main() {
  const longans = [];
  const shortans = [];
  const text = [];
  for (let i = 0; i < N; i++) {
    const kind = CATEGORIES[i % CATEGORIES.length];
    const imgRel = `demo_set/demo_${String(i).padStart(4, "0")}.png`;
    if (i < 60) {
      await sharp(Buffer.from(svgChart(i)))
        .png()
        .toFile(path.join(ROOT, "images", imgRel));
    }
    const image = i < 60 ? imgRel : `demo_set/demo_${String(i % 60).padStart(4, "0")}.png`;
    const max = Math.max(...[1, 2, 3].map((k) => (i * 37 + k * 53) % 140));
    longans.push({
      id: `demo_${kind}_${i}`,
      image,
      conversations: [
        {
          from: "system",
          value: "Answer the question with detailed explanation. Try to reason step by step.",
        },
        { from: "human", value: `<|image|>\nWhat type of chart is shown in the image?` },
        {
          from: "gpt",
          value: `To identify the chart type:\n\n1. **Look at the marks**: the figure uses ${kind === "bar" ? "vertical rectangles" : kind === "line" ? "a connected polyline" : kind === "pie" ? "concentric circular areas" : "a grid of cells"}.\n2. **Match to a chart family**: this corresponds to a **${kind} chart**.\n\n**Final Answer:** \\boxed{\\text{${kind} chart}}`,
        },
        { from: "human", value: "What is the largest value shown, approximately?" },
        {
          from: "gpt",
          value: `Reading the tallest element against the axis gives roughly ${max}.\n\n\\boxed{${max}}`,
        },
      ],
      meta: { category: kind, difficulty: ["easy", "medium", "hard"][i % 3] },
    });
    shortans.push({
      id: `demo_${kind}_${i}`,
      image,
      conversations: [
        { from: "human", value: `<|image|>\nWhat type of chart is this? Answer with one word.` },
        { from: "gpt", value: `\\boxed{${kind}}` },
      ],
      meta: { category: kind },
    });
    text.push({
      id: `demo_text_${i}`,
      conversations: [
        { from: "human", value: `Compute ${i} + ${i * 2}.` },
        { from: "gpt", value: `${i} + ${i * 2} = ${i * 3}.\n\n\\boxed{${i * 3}}` },
      ],
      meta: { category: "arithmetic" },
    });
  }
  fs.writeFileSync(path.join(ROOT, "demo_longans.json"), JSON.stringify(longans));
  fs.writeFileSync(path.join(ROOT, "demo_shortans.json"), JSON.stringify(shortans));
  fs.writeFileSync(path.join(ROOT, "demo_text.json"), JSON.stringify(text));

  const header = [
    "datapack",
    "category",
    "sub_category",
    "language",
    "dataset",
    "origin_json",
    "longer_json_path",
    "longer_n_samples",
    "longans_json_path",
    "longans_n_samples",
    "shortans_json_path",
    "shortans_n_samples",
    "longer_sft_weight",
    "longans_sft_weight",
    "shortans_sft_weight",
    "mx_weight_1",
    "mx_weight_2",
    "n_samples_total",
    "n_samples_training",
    "n_samples_mx_weight_1",
    "n_samples_mx_weight_2",
    "note",
  ];
  const rel = (f) => `./data/samples/demo/${f}`;
  const rows = [
    [
      "demo",
      "Diagram, Chart, Table",
      "",
      "en",
      "demo_charts",
      "demo_charts.json",
      "",
      0,
      rel("demo_longans.json"),
      N,
      rel("demo_shortans.json"),
      N,
      1,
      1,
      1,
      0.5,
      1,
      2 * N,
      2 * N,
      N,
      2 * N,
      "로컬 데모 데이터",
    ],
    [
      "demo",
      "Math",
      "Arithmetic",
      "en",
      "demo_text",
      "demo_text.json",
      "",
      0,
      rel("demo_text.json"),
      N,
      "",
      0,
      1,
      1,
      1,
      1,
      1,
      N,
      N,
      N,
      N,
      "텍스트 전용",
    ],
  ];
  const tsv = [header, ...rows].map((r) => r.join("\t")).join("\n") + "\n";
  fs.writeFileSync(path.resolve("data/samples/manifest_local_demo.tsv"), tsv);
  console.log(`wrote ${N} samples x 3 files, 60 images, manifest_local_demo.tsv`);
  console.log(`IMAGE_ROOT for this demo: ${path.join(ROOT, "images")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
