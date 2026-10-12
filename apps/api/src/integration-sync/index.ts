import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import { readSyncRules } from "../plugins/sync/rules";
import db from "../database";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { getSyncIntegration } from "./controllers/get-integration";
import { getAuthorizedSyncProject } from "./controllers/authorized-project";
import { previewSyncRules } from "./controllers/preview-rules";
import { resumeSync } from "./controllers/resume-sync";
import { reviewSyncResume } from "./controllers/review-resume";
import { saveSyncRules } from "./controllers/save-rules";
import {
  bindingResumeParams,
  bindingSyncParams,
  resumeBody,
  resumePreviewSchema,
  rulesBody,
  saveRulesBody,
  syncPreviewSchema,
} from "./schema";

// RFC 0001 WP5: integration-id-keyed routes authorize through the binding
// (WP1 fromIntegration) instead of the project.
const bindingAccess = [
  workspaceAccess.fromIntegration("integrationId"),
  requireWorkspacePermission({ project: ["read"], task: ["read"] }),
];
const bindingManage = [
  ...bindingAccess,
  requireWorkspacePermission({ workspace: ["manage_settings"] }),
];
const errors = {
  400: errorResponse("Invalid rule or workspace label"),
  403: errorResponse(
    "No access to the project, or missing required permission",
  ),
  404: errorResponse("Project, integration, or linked task not found"),
  409: errorResponse(
    "Configuration, impact or comparison changed; review again",
  ),
};
const body = <T extends z.ZodType>(schema: T) => ({
  required: true as const,
  content: { "application/json": { schema } },
});

// --- id-keyed handlers ------------------------------------------------------

async function handleGetSync(integrationId: string, after?: string) {
  return db.transaction(async (tx) => {
    const integration = await getSyncIntegration(integrationId, tx);
    await getAuthorizedSyncProject(
      integration.projectId,
      integration.project.workspaceId,
      tx,
      true,
    );
    return previewSyncRules(
      integration,
      readSyncRules(integration.config)!,
      tx,
      after,
    );
  });
}

async function handlePreviewSync(integrationId: string, rules: unknown) {
  return db.transaction(async (tx) => {
    const integration = await getSyncIntegration(integrationId, tx);
    await getAuthorizedSyncProject(
      integration.projectId,
      integration.project.workspaceId,
      tx,
      true,
    );
    return previewSyncRules(integration, rules as never, tx);
  });
}

// --- id-keyed routes (RFC 0001 WP5) ----------------------------------------

const bindingPath = "/integration/{integrationId}";

const getBindingRoute = createRoute({
  method: "get",
  path: bindingPath,
  operationId: "getIntegrationSyncRulesById",
  tags: ["Integration sync"],
  summary: "Get sync rules and current task scope for one binding",
  description:
    "Workspace members with project and task read permissions can inspect saved rules of one repository binding. Rules remain active when advanced mode is hidden. Paused issue links are preserved; eligible paused tasks require review before resuming.",
  middleware: bindingAccess,
  request: {
    params: bindingSyncParams,
    query: z.object({ after: z.string().optional() }),
  },
  responses: {
    200: jsonResponse("Saved rules and scope", syncPreviewSchema),
    ...errors,
  },
});
const previewBindingRoute = createRoute({
  method: "post",
  path: `${bindingPath}/preview`,
  operationId: "previewIntegrationSyncRulesById",
  tags: ["Integration sync"],
  summary: "Preview a sync rule change for one binding",
  description:
    "Returns matching tasks, new exports, paused links and a token bound to the addressed binding and impact. Outgoing labels are workspace label IDs; incoming labels are exact repository label names.",
  middleware: bindingManage,
  request: { params: bindingSyncParams, body: body(rulesBody) },
  responses: {
    200: jsonResponse("Proposed rule impact", syncPreviewSchema),
    ...errors,
  },
});
const saveBindingRoute = createRoute({
  method: "patch",
  path: bindingPath,
  operationId: "saveIntegrationSyncRulesById",
  tags: ["Integration sync"],
  summary: "Apply a previewed sync rule to one binding",
  description:
    "Save one repository binding's rules only if its preview is still current. Excluded links are paused, never deleted. Newly matching unlinked tasks are exported through the integration event path. Paused links require explicit review to resume.",
  middleware: bindingManage,
  request: { params: bindingSyncParams, body: body(saveRulesBody) },
  responses: {
    200: jsonResponse("Saved rules and current scope", syncPreviewSchema),
    ...errors,
  },
});
const reviewBindingRoute = createRoute({
  method: "get",
  path: `${bindingPath}/links/{linkId}/review`,
  operationId: "reviewIntegrationSyncResumeById",
  tags: ["Integration sync"],
  summary: "Compare a paused task with its external issue for one binding",
  middleware: bindingManage,
  request: { params: bindingResumeParams },
  responses: {
    200: jsonResponse(
      "Current values and comparison token",
      resumePreviewSchema,
    ),
    ...errors,
    502: errorResponse("External issue unavailable; sync remains paused"),
  },
});
const resumeBindingRoute = createRoute({
  method: "post",
  path: `${bindingPath}/links/{linkId}/resume`,
  operationId: "resumeIntegrationSyncById",
  tags: ["Integration sync"],
  summary: "Resume a reviewed issue link of one binding",
  description:
    "Explicitly choose the current Kaneo or repository title, description and open/closed state. Existing links are reused; historical comments are not replayed. The task must still match its outgoing rule. A changed comparison requires another review.",
  middleware: [
    ...bindingManage,
    requireWorkspacePermission({ task: ["update"] }),
  ],
  request: { params: bindingResumeParams, body: body(resumeBody) },
  responses: {
    200: jsonResponse("Sync resumed", z.object({ success: z.boolean() })),
    ...errors,
    409: errorResponse(
      "Comparison changed or synchronization is busy; review or retry",
    ),
    502: errorResponse("External issue unavailable; sync remains paused"),
  },
});

function reviewResponse(review: Awaited<ReturnType<typeof reviewSyncResume>>) {
  return {
    task: {
      id: review.task.id,
      number: review.task.number,
      title: review.task.title,
    },
    local: review.local,
    remote: review.remote,
    token: review.token,
  };
}

export default apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(getBindingRoute, async (c) => {
    const { integrationId } = c.req.valid("param");
    return c.json(
      await handleGetSync(integrationId, c.req.valid("query").after),
      200,
    );
  })
  .openapi(previewBindingRoute, async (c) => {
    const { integrationId } = c.req.valid("param");
    const { rules } = c.req.valid("json");
    return c.json(await handlePreviewSync(integrationId, rules), 200);
  })
  .openapi(saveBindingRoute, async (c) => {
    const { integrationId } = c.req.valid("param");
    const { rules, previewToken } = c.req.valid("json");
    return c.json(
      await saveSyncRules(
        integrationId,
        rules,
        previewToken,
        c.get("workspaceId"),
      ),
      200,
    );
  })
  .openapi(reviewBindingRoute, async (c) => {
    const { integrationId, linkId } = c.req.valid("param");
    const review = await reviewSyncResume(
      integrationId,
      linkId,
      c.get("workspaceId"),
    );
    return c.json(reviewResponse(review), 200);
  })
  .openapi(resumeBindingRoute, async (c) => {
    const { integrationId, linkId } = c.req.valid("param");
    const { source, token } = c.req.valid("json");
    return c.json(
      await resumeSync(
        integrationId,
        linkId,
        token,
        source,
        c.get("workspaceId"),
      ),
      200,
    );
  });
