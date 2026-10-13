import { expect, test } from "./fixtures"

import { dismissCookies } from "./helpers"

for (const path of [
  "/",
  "/image",
  "/video",
  "/effects",
  "/templates",
  "/pricing",
  "/login",
]) {
  test(`no horizontal scroll at 390px: ${path}`, async ({ page }) => {
    await page.goto(path)
    await dismissCookies(page)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test("Generate stays reachable on the video generator at 390px", async ({
  page,
}, testInfo) => {
  await page.goto("/video")
  await dismissCookies(page)
  const generate = page.getByRole("button", { name: /^Generate/ })
  await expect(generate).toHaveCount(1)
  await expect(generate).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath("video-mobile.png") })
  await page.getByRole("region", { name: "Results" }).scrollIntoViewIfNeeded()
  await expect(generate).toBeInViewport()
})

test("video modes fit a 320px screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto("/video")
  const modes = page.getByRole("tablist", { name: "Mode", exact: true })
  expect(
    await modes.evaluate((node) => node.scrollWidth - node.clientWidth)
  ).toBe(0)
})

test("image settings open above the dock on mobile", async ({ page }) => {
  await page.goto("/image?model=soul-2")
  await page.getByRole("combobox", { name: "Aspect ratio" }).click()
  const menu = page.getByRole("listbox")
  await expect(menu).toBeVisible()
  await expect(menu).toBeInViewport()
  await menu.getByRole("option", { name: "9:16", exact: true }).click()
  await expect(
    page.getByRole("combobox", { name: "Aspect ratio" })
  ).toContainText("9:16")
})
