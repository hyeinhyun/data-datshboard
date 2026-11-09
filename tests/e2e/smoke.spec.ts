import { expect, test } from "@playwright/test";

const SECTIONS = [
  { href: "/", heading: "개요" },
  { href: "/superpacks", heading: "Superpack" },
  { href: "/datapacks", heading: "Datapack" },
  { href: "/datasets", heading: "Dataset" },
  { href: "/samples", heading: "샘플" },
  { href: "/import", heading: "가져오기" },
  { href: "/settings", heading: "설정" },
];

for (const section of SECTIONS) {
  test(`renders ${section.href}`, async ({ page }) => {
    await page.goto(section.href);
    await expect(page.getByRole("heading", { level: 2, name: section.heading })).toBeVisible();
  });
}

test("sidebar navigates between sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Dataset" }).click();
  await expect(page).toHaveURL(/\/datasets$/);
  await expect(page.getByRole("heading", { level: 2, name: "Dataset" })).toBeVisible();
});
