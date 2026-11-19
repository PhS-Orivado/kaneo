# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sprints.spec.ts >> plan, run, and close a sprint around one backlog task
- Location: sprints.spec.ts:65:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('complementary', { name: 'Properties' }).getByRole('button', { name: 'Backlog', exact: true })
Expected substring: "Sprint 1"
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" getByRole('complementary', { name: 'Properties' }).getByRole('button', { name: 'Backlog', exact: true }) with timeout 15000ms
  - waiting for getByRole('complementary', { name: 'Properties' }).getByRole('button', { name: 'Backlog', exact: true })
    2 × locator resolved to <button tabindex="0" type="button" data-pressed="" data-popup-open="" id="base-ui-_r_43_" aria-expanded="true" aria-haspopup="dialog" aria-controls="_r_42_" data-slot="popover-trigger" data-base-ui-click-trigger="" class="relative inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-lg border font-medium text-base outline-none transition-[box-shadow,scale] duration-150 ease-out active:scale-[0.97] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(…>…</button>
      - unexpected value "Backlog"

```

```yaml
- main:
  - status
- region "Notifications"
- dialog:
  - text: Browser project
  - button "BP-1"
  - button "Copy task link"
  - button "Copy task branch"
  - button "More actions"
  - button "Open in full page"
  - button "Close"
  - textbox "Click to add a title": Sprint planning chore
  - region "Task description editor":
    - status: Saved
    - button "Choose File"
    - textbox:
      - paragraph: Write a description...
    - button "Attach file"
  - heading "Sub-tasks" [level=3]
  - button "Add Sub-tasks"
  - paragraph: No subtasks yet
  - heading "Relations" [level=3]
  - button "Add Relations"
  - paragraph: No related tasks
  - button "Time tracking"
  - button "Start timer"
  - heading "Resources" [level=3]:
    - button "Resources" [expanded]
  - button "Add resource"
  - paragraph: No resources linked to this task.
  - region "Activity":
    - heading "Activity" [level=2]
    - text: ST Sprint Tester created this task · 1 second ago
    - region "Comment editor":
      - button "Choose File"
      - textbox:
        - paragraph: Leave a comment...
    - button "Attach file"
    - button [disabled]
  - complementary "Properties":
    - text: Status
    - button "Planned"
    - text: Sprint
    - button "Sprint 1"
    - text: Type Task Priority
    - button "No priority"
    - text: Assignee
    - button "Unassigned"
    - text: Labels
    - button "Add labels"
    - text: Dates
    - button "Start"
    - button "Due date"
    - text: Project Browser project
```

# Test source

```ts
  13  |     data,
  14  |     // Authenticated fixture requests must satisfy the same origin checks as the UI.
  15  |     headers: { Origin: new URL(baseURL).origin },
  16  |   });
  17  |   await expect(response).toBeOK();
  18  |   return response.json();
  19  | }
  20  | 
  21  | async function signUp(request: APIRequestContext) {
  22  |   const suffix = randomUUID();
  23  |   const email = `sprint-${suffix}@example.com`;
  24  |   await post(request, "auth/sign-up/email", {
  25  |     name: "Sprint Tester",
  26  |     email,
  27  |     password: `Browser-test-${suffix}`,
  28  |   });
  29  |   return email;
  30  | }
  31  | 
  32  | async function createWorkspace(page: Page) {
  33  |   await signUp(page.request);
  34  |   const workspace = await post(page.request, "auth/organization/create", {
  35  |     name: "Sprint test workspace",
  36  |     slug: `browser-${randomUUID()}`,
  37  |   });
  38  |   await post(page.request, "auth/organization/set-active", {
  39  |     organizationId: workspace.id,
  40  |   });
  41  |   await page.goto(`/dashboard/workspace/${workspace.id}`);
  42  |   return workspace.id as string;
  43  | }
  44  | 
  45  | async function createProject(page: Page) {
  46  |   await page.getByRole("link", { name: "All projects", exact: true }).click();
  47  |   await expect(page).toHaveURL(/\/projects$/);
  48  |   await page
  49  |     .getByRole("button", { name: "Create project", exact: true })
  50  |     .first()
  51  |     .click();
  52  |   await page
  53  |     .getByPlaceholder("Project name", { exact: true })
  54  |     .fill("Browser project");
  55  |   await page
  56  |     .getByRole("button", { name: "Create Project", exact: true })
  57  |     .click();
  58  |   await expect(page).toHaveURL(/\/project\/[^/]+\/board$/);
  59  |   await expect(
  60  |     page.getByTitle("Add task", { exact: true }).first(),
  61  |   ).toBeVisible();
  62  |   return page.url();
  63  | }
  64  | 
  65  | test("plan, run, and close a sprint around one backlog task", async ({
  66  |   page,
  67  | }) => {
  68  |   await createWorkspace(page);
  69  |   const boardUrl = await createProject(page);
  70  |   const backlogUrl = boardUrl.replace("/board", "/backlog");
  71  |   const sprintsUrl = boardUrl.replace("/board", "/sprints");
  72  | 
  73  |   // Seed one task through the real creation modal; it lands in the backlog.
  74  |   await page.goto(backlogUrl);
  75  |   await page.getByTitle("Add task", { exact: true }).first().click();
  76  |   await page
  77  |     .getByPlaceholder("Task title", { exact: true })
  78  |     .fill("Sprint planning chore");
  79  |   await page.getByRole("button", { name: "Create Task", exact: true }).click();
  80  |   await expect(
  81  |     page.getByText("Sprint planning chore", { exact: true }),
  82  |   ).toBeVisible();
  83  | 
  84  |   // Plan the first sprint on the sprint planning view. An empty name makes the
  85  |   // API pick the next free "Sprint N".
  86  |   await page.goto(sprintsUrl);
  87  |   await page
  88  |     .getByRole("button", { name: "Create sprint", exact: true })
  89  |     .click();
  90  |   await page
  91  |     .getByRole("button", { name: "Create sprint", exact: true })
  92  |     .last()
  93  |     .click();
  94  |   await expect(page.getByText("Sprint 1", { exact: true })).toBeVisible();
  95  | 
  96  |   // Assign the task to the sprint from the backlog task sheet's sprint control.
  97  |   await page.goto(backlogUrl);
  98  |   await page
  99  |     .getByText("Sprint planning chore", { exact: true })
  100 |     .first()
  101 |     .click();
  102 |   // The popover adds its own "Backlog" option button while open, so the
  103 |   // trigger must be scoped to the properties rail to stay unambiguous.
  104 |   const sprintTrigger = page
  105 |     .getByRole("complementary", { name: "Properties" })
  106 |     .getByRole("button", { name: "Backlog", exact: true });
  107 |   await expect(sprintTrigger).toBeVisible();
  108 |   await sprintTrigger.click();
  109 |   await page
  110 |     .getByRole("button", { name: "Sprint 1", exact: true })
  111 |     .last()
  112 |     .click();
> 113 |   await expect(sprintTrigger).toContainText("Sprint 1");
      |                               ^ Error: expect(locator).toContainText(expected) failed
  114 |   await page.getByRole("button", { name: "Close", exact: true }).click();
  115 |   // Scheduled tasks are planned on the sprints view, so they leave the backlog.
  116 |   await expect(
  117 |     page.getByText("Sprint planning chore", { exact: true }),
  118 |   ).toHaveCount(0);
  119 | 
  120 |   // Start the sprint; it becomes the project's single active sprint.
  121 |   await page.goto(sprintsUrl);
  122 |   await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  123 |   await expect(page.getByText("Active", { exact: true })).toBeVisible();
  124 | 
  125 |   // Close the sprint. With no future sprint the unfinished task returns to
  126 |   // the backlog, and the sprint stays visible as closed history.
  127 |   await page.getByRole("button", { name: "Close sprint", exact: true }).click();
  128 |   await page
  129 |     .getByRole("button", {
  130 |       name: "Close sprint and move unfinished tasks",
  131 |       exact: true,
  132 |     })
  133 |     .click();
  134 |   await expect(
  135 |     page.getByText("Closed sprints (1)", { exact: true }),
  136 |   ).toBeVisible();
  137 |   await page.goto(backlogUrl);
  138 |   await expect(
  139 |     page.getByText("Sprint planning chore", { exact: true }),
  140 |   ).toBeVisible();
  141 | });
  142 | 
```