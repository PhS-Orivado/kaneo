# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tasks.spec.ts >> task timer persists across reloads and stops from task details
- Location: tasks.spec.ts:215:1

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator: getByRole('button', { name: 'Start timer', exact: true })
Expected: enabled
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeEnabled" getByRole('button', { name: 'Start timer', exact: true }) with timeout 15000ms
  - waiting for getByRole('button', { name: 'Start timer', exact: true })

```

```yaml
- status
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
  - textbox "Click to add a title": Track release work
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
  - heading "Resources" [level=3]:
    - button "Resources" [expanded]
  - button "Add resource"
  - paragraph: No resources linked to this task.
  - region "Activity":
    - heading "Activity" [level=2]
    - text: TT Task Tester created this task · 1 second ago
    - region "Comment editor":
      - button "Choose File"
      - textbox:
        - paragraph: Leave a comment...
    - button "Attach file"
    - button [disabled]
  - complementary "Properties":
    - text: Status
    - button "To Do"
    - text: Sprint
    - button "Backlog"
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
  128 |     locale: "en-US",
  129 |     viewport: { width: 1440, height: 1000 },
  130 |   });
  131 |   try {
  132 |     const email = await signUp(colleague.request);
  133 |     const invitation = await post(
  134 |       page.request,
  135 |       "auth/organization/invite-member",
  136 |       {
  137 |         organizationId: workspaceId,
  138 |         email,
  139 |         role: "member",
  140 |       },
  141 |     );
  142 |     await post(colleague.request, "auth/organization/accept-invitation", {
  143 |       invitationId: invitation.id,
  144 |     });
  145 |     await post(colleague.request, "auth/organization/set-active", {
  146 |       organizationId: workspaceId,
  147 |     });
  148 |     const observer = await colleague.newPage();
  149 |     const projectId = new URL(boardUrl).pathname
  150 |       .split("/project/")[1]
  151 |       .split("/")[0];
  152 |     let connectedSocket: WebSocket | undefined;
  153 |     const socketErrors: string[] = [];
  154 |     observer.on("console", (message) => {
  155 |       if (message.type() === "error") socketErrors.push(message.text());
  156 |     });
  157 |     observer.on("websocket", (socket) => {
  158 |       if (new URL(socket.url()).pathname !== `/api/ws/${projectId}`) return;
  159 |       socket.on("socketerror", (error) => socketErrors.push(String(error)));
  160 |       socket.on("framesent", ({ payload }) => {
  161 |         if (String(payload) === '{"type":"ping"}') connectedSocket = socket;
  162 |       });
  163 |       socket.on("close", () => {
  164 |         if (connectedSocket === socket) connectedSocket = undefined;
  165 |       });
  166 |     });
  167 |     await observer.goto(boardUrl);
  168 |     await expect(
  169 |       observer.getByText("Collaborative task", { exact: true }),
  170 |     ).toBeVisible();
  171 | 
  172 |     // Playwright's websocket event fires before the handshake succeeds. The app's
  173 |     // native keepalive proves it is open and also tolerates its normal reconnects.
  174 |     await expect
  175 |       .poll(() => Boolean(connectedSocket), {
  176 |         timeout: 45_000,
  177 |         message: "The project websocket must send its keepalive before editing",
  178 |       })
  179 |       .toBe(true)
  180 |       .catch(async (error) => {
  181 |         await test.info().attach("websocket-errors", {
  182 |           body: JSON.stringify(socketErrors),
  183 |           contentType: "application/json",
  184 |         });
  185 |         throw error;
  186 |       });
  187 |     if (!connectedSocket) throw new Error("Project websocket disconnected");
  188 | 
  189 |     // Observe the real event as well as the UI, so a refetch cannot hide a broken websocket.
  190 |     const update = connectedSocket.waitForEvent(
  191 |       "framereceived",
  192 |       ({ payload }) => {
  193 |         const message = JSON.parse(String(payload));
  194 |         return (
  195 |           message.type === "TASK_UPDATED" && message.projectId === projectId
  196 |         );
  197 |       },
  198 |     );
  199 |     await Promise.all([
  200 |       update,
  201 |       editTask(page, "Collaborative task", "Updated by my teammate"),
  202 |     ]);
  203 |     // Keep this page open: no reload, navigation, or focus change to trigger a refetch.
  204 |     await expect(
  205 |       observer.getByText("Updated by my teammate", { exact: true }),
  206 |     ).toBeVisible();
  207 |     await expect(
  208 |       observer.getByText("Collaborative task", { exact: true }),
  209 |     ).toHaveCount(0);
  210 |   } finally {
  211 |     await colleague.close();
  212 |   }
  213 | });
  214 | 
  215 | test("task timer persists across reloads and stops from task details", async ({
  216 |   page,
  217 | }) => {
  218 |   await createWorkspace(page);
  219 |   await createProject(page);
  220 |   await createTask(page, "Track release work");
  221 |   await page.getByText("Track release work", { exact: true }).click();
  222 |   const start = page.getByRole("button", { name: "Start timer", exact: true });
  223 |   const stop = page.getByRole("button", { name: "Stop timer", exact: true });
  224 |   const history = page.getByRole("button", {
  225 |     name: "Time tracking",
  226 |     exact: true,
  227 |   });
> 228 |   await expect(start).toBeEnabled();
      |                       ^ Error: expect(locator).toBeEnabled() failed
  229 |   await history.click();
  230 |   await expect(
  231 |     page.getByText("No time logged yet.", { exact: true }),
  232 |   ).toBeVisible();
  233 | 
  234 |   const [created] = await Promise.all([
  235 |     page.waitForResponse(
  236 |       (response) =>
  237 |         /^\/api\/time-entry\/?$/.test(new URL(response.url()).pathname) &&
  238 |         response.request().method() === "POST",
  239 |     ),
  240 |     start.click(),
  241 |   ]);
  242 |   expect(created.ok()).toBe(true);
  243 |   const entry = await created.json();
  244 |   expect(entry.endTime).toBeNull();
  245 |   await expect(stop).toBeEnabled();
  246 |   await expect(page.getByText(/^Running \d+s$/)).toBeVisible();
  247 | 
  248 |   await page.reload();
  249 |   await expect(stop).toBeEnabled();
  250 |   await history.click();
  251 |   await expect(page.getByText(/^Running \d+s$/)).toBeVisible();
  252 |   await page.screenshot({ path: test.info().outputPath("timer-running.png") });
  253 |   const [updated] = await Promise.all([
  254 |     page.waitForResponse(
  255 |       (response) =>
  256 |         new URL(response.url()).pathname === `/api/time-entry/${entry.id}` &&
  257 |         response.request().method() === "PUT",
  258 |     ),
  259 |     stop.click(),
  260 |   ]);
  261 |   expect(updated.ok()).toBe(true);
  262 |   const stopped = await updated.json();
  263 |   expect(stopped.endTime).not.toBeNull();
  264 |   expect(stopped.duration).toBeGreaterThanOrEqual(0);
  265 |   await expect(start).toBeEnabled();
  266 |   await expect(stop).toHaveCount(0);
  267 | 
  268 |   await page.reload();
  269 |   await expect(start).toBeEnabled();
  270 |   await history.click();
  271 |   await expect(
  272 |     page.getByText("Task Tester", { exact: true }).last(),
  273 |   ).toBeVisible();
  274 |   await expect(page.getByText(/^Running /)).toHaveCount(0);
  275 |   const response = await page.request.get(
  276 |     `/api/time-entry/task/${entry.taskId}`,
  277 |   );
  278 |   await expect(response).toBeOK();
  279 |   const entries = await response.json();
  280 |   expect(entries).toHaveLength(1);
  281 |   expect(entries[0]).toMatchObject({
  282 |     id: entry.id,
  283 |     endTime: stopped.endTime,
  284 |     duration: stopped.duration,
  285 |   });
  286 |   await page.screenshot({ path: test.info().outputPath("timer-stopped.png") });
  287 | });
  288 | 
```