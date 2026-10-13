import { expect, test } from "./fixtures"

const ROUTES = [
  "/",
  "/image",
  "/video",
  "/effects",
  "/effects/neon-noir",
  "/templates",
  "/pricing",
  "/login",
  "/legal/terms",
]

test("selectors stay above the video settings dialog", async ({
  page,
}, testInfo) => {
  await page.goto("/video?tab=edit&model=kling-o3-edit")
  await page.getByRole("button", { name: "More settings" }).click()
  const dialog = page.getByRole("dialog", { name: "Kling O3 Edit settings" })
  await dialog.getByRole("combobox", { name: "Mode", exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath("settings-selector.png") })
  await page.getByRole("option", { name: "std", exact: true }).click()
  await expect(
    dialog.getByRole("combobox", { name: "Mode", exact: true })
  ).toContainText("std")
})

for (const route of ROUTES) {
  test(`${route} renders without console errors`, async ({ page }) => {
    const errors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text())
    })
    const response = await page.goto(route)
    expect(response?.status()).toBe(200)
    await expect(page.locator("main")).toBeVisible()
    expect(
      errors.filter((text) => !/favicon|Download the React DevTools/.test(text))
    ).toEqual([])
  })
}

test("unknown effect and private generation are 404", async ({ page }) => {
  expect((await page.goto("/effects/does-not-exist"))?.status()).toBe(404)
  expect((await page.goto("/g/000000000000000000000000"))?.status()).toBe(404)
})

test("audio stays hidden until an audio model exists", async ({ page }) => {
  expect((await page.goto("/audio"))?.status()).toBe(404)
  await page.goto("/")
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Audio" })
  ).toHaveCount(0)
})
