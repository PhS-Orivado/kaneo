import { randomUUID } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

async function post(request: APIRequestContext, path: string, data: object) {
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error("Browser tests require a baseURL");
  const response = await request.post(`/api/${path}`, {
    data,
    // Fixture requests must satisfy the same origin checks as the UI.
    headers: { Origin: new URL(baseURL).origin },
  });
  await expect(response).toBeOK();
  return response.json();
}

async function signUp(request: APIRequestContext) {
  const suffix = randomUUID();
  const email = `attribute-${suffix}@example.com`;
  await post(request, "auth/sign-up/email", {
    name: "Attribute Tester",
    email,
    password: `Browser-test-${suffix}`,
  });
  return email;
}

async function createWorkspace(page: Page) {
  await signUp(page.request);
  const workspace = await post(page.request, "auth/organization/create", {
    name: "Attribute test workspace",
    slug: `browser-${randomUUID()}`,
  });
  await post(page.request, "auth/organization/set-active", {
    organizationId: workspace.id,
  });
  await page.goto(`/dashboard/workspace/${workspace.id}`);
  return workspace.id as string;
}

async function createProject(page: Page) {
  await page.getByRole("link", { name: "All projects", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .first()
    .click();
  await page
    .getByPlaceholder("Project name", { exact: true })
    .fill("Browser project");
  await page
    .getByRole("button", { name: "Create Project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/project\/[^/]+\/board$/);
  await expect(
    page.getByTitle("Add task", { exact: true }).first(),
  ).toBeVisible();
}

async function createTask(page: Page, title: string) {
  await page.getByTitle("Add task", { exact: true }).first().click();
  await page.getByPlaceholder("Task title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create Task", exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

// The details sheet renders up to three attribute triggers with the same
// accessible name: the header button is always first in the DOM. Attribute
// options are portaled to the end of the body, after the board and the sheet.
async function selectTaskAttribute(
  page: Page,
  taskTitle: string,
  option: string,
) {
  await page.getByText(taskTitle, { exact: true }).click();
  const typeButton = page
    .getByRole("button", { name: "Type", exact: true })
    .first();
  await expect(typeButton).toBeVisible();
  await typeButton.click();
  await expect(
    page.getByRole("button", { name: "None", exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: option, exact: true })
    .last()
    .click();
  // The popover closes after the attribute update resolves.
  await expect(
    page.getByRole("button", { name: "None", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByPlaceholder("Click to add a title", { exact: true }),
  ).toBeHidden();
}

async function openAttributeFacet(page: Page) {
  await page
    .getByRole("button", { name: "Filter", exact: true })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Type", exact: true }).click();
}

test("define, edit, and delete a task attribute", async ({ page }) => {
  await createWorkspace(page);
  await page.goto("/dashboard/settings/workspace/task-attributes");

  // New workspaces start with the seeded definitions, Task as default.
  await expect(page.getByTitle("Task", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Bug", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Doc", { exact: true })).toBeVisible();
  await expect(page.getByText("Default", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Create Task Attribute", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Attribute name", { exact: true }).fill("Research");
  await dialog
    .getByRole("button", { name: "Create Task Attribute", exact: true })
    .click();
  await expect(page.getByTitle("Research", { exact: true })).toBeVisible();

  const researchRow = page
    .locator("div.divide-y > div")
    .filter({ hasText: "Research" });
  await researchRow
    .getByRole("button", { name: "Edit Task Attribute", exact: true })
    .click();
  await dialog
    .getByLabel("Attribute name", { exact: true })
    .fill("Investigation");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByTitle("Investigation", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTitle("Research", { exact: true })).toHaveCount(0);

  const investigationRow = page
    .locator("div.divide-y > div")
    .filter({ hasText: "Investigation" });
  await investigationRow
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  const alert = page.getByRole("alertdialog");
  await expect(alert.getByText("Delete this task attribute?")).toBeVisible();
  await alert
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByTitle("Investigation", { exact: true }),
  ).toHaveCount(0);
});

test("assign and clear a task attribute from the task details", async ({
  page,
}) => {
  await createWorkspace(page);
  await createProject(page);
  await createTask(page, "Plan the release");

  // New tasks carry the workspace default attribute from the create dialog.
  await expect(page.getByTitle("Task", { exact: true })).toBeVisible();

  await page.getByText("Plan the release", { exact: true }).click();
  const typeButton = page
    .getByRole("button", { name: "Type", exact: true })
    .first();
  await expect(typeButton).toBeVisible();
  await typeButton.click();
  await expect(
    page.getByRole("button", { name: "None", exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bug", exact: true })
    .last()
    .click();
  await expect(typeButton.getByTitle("Bug", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTitle("Bug", { exact: true })).toBeVisible();

  await page.getByText("Plan the release", { exact: true }).click();
  await typeButton.click();
  await page
    .getByRole("button", { name: "None", exact: true })
    .last()
    .click();
  await expect(typeButton.getByTitle("Bug", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTitle("Bug", { exact: true })).toHaveCount(0);
});

test("filter the board by task attribute", async ({ page }) => {
  await createWorkspace(page);
  await createProject(page);
  await createTask(page, "Typed task");
  await createTask(page, "Plain task");

  await selectTaskAttribute(page, "Typed task", "Bug");
  await selectTaskAttribute(page, "Plain task", "None");

  await openAttributeFacet(page);
  await page
    .getByRole("menuitemcheckbox", { name: "Bug", exact: true })
    .click();

  await expect(page.getByText("Typed task", { exact: true })).toBeVisible();
  await expect(page.getByText("Plain task", { exact: true })).toHaveCount(0);
  await expect(page.getByText("is any of", { exact: true })).toBeVisible();

  await openAttributeFacet(page);
  await page
    .getByRole("menuitemcheckbox", { name: "No type", exact: true })
    .click();

  await expect(page.getByText("Typed task", { exact: true })).toBeVisible();
  await expect(page.getByText("Plain task", { exact: true })).toBeVisible();

  await openAttributeFacet(page);
  await page
    .getByRole("button", { name: "All types", exact: true })
    .click();
  await page.keyboard.press("Escape");

  await expect(page.getByText("Typed task", { exact: true })).toBeVisible();
  await expect(page.getByText("Plain task", { exact: true })).toBeVisible();
  await expect(page.getByText("is any of", { exact: true })).toHaveCount(0);
});
