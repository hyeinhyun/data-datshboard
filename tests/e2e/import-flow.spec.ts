import path from "node:path";

import { expect, test } from "@playwright/test";

const FIXTURE = path.resolve(__dirname, "../../data/samples/manifest_example.tsv");

test.describe.serial("manifest import → overview → dataset → tag", () => {
  test("imports the example manifest through the UI", async ({ page }) => {
    await page.goto("/import");
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);
    await page.getByRole("button", { name: "미리보기" }).click();
    await expect(page.getByText("manifest_example", { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: "적용" }).click();
    await expect(page.getByText("적용 완료")).toBeVisible();
  });

  test("overview shows the superpack KPIs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: "manifest_example" })).toBeVisible();
    await expect(page.getByText("308,578").first()).toBeVisible();
  });

  test("dataset table filters by category and opens the detail", async ({ page }) => {
    await page.goto("/datasets?sp=all&cat=OCR");
    await expect(page.getByText("english rendered text (OCR)")).toBeVisible();
    await page.getByText("english rendered text (OCR)").click();
    await expect(
      page.getByRole("heading", { level: 2, name: "english rendered text (OCR)" }),
    ).toBeVisible();
    await expect(page.getByText("longans")).toBeVisible();
  });

  test("adds and removes a tag on the dataset", async ({ page }) => {
    await page.goto("/datasets?sp=all");
    await page.getByText("english rendered text (OCR)").click();
    await page.getByLabel("태그 이름").fill("e2e-tag");
    await page.getByRole("button", { name: "추가" }).click();
    await expect(page.getByText("e2e-tag")).toBeVisible();
    await page.getByRole("button", { name: "e2e-tag 태그 제거" }).click();
    await expect(page.getByText("e2e-tag")).toHaveCount(0);
  });

  test("global search finds the dataset", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "전역 검색 열기" }).click();
    await page.getByPlaceholder("이름, 카테고리, 경로, 질문 내용…").fill("LVIS");
    await expect(page.getByText("LVIS (OCR)")).toBeVisible();
  });
});
