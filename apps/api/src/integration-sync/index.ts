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
import {
  getSyncIntegration,
  getSyncIntegrationById,
} from "./controllers/get-integration";
import { getAuthorizedSyncProject } from "./controllers/authorized-project";
import { previewSyncRules } from "./controllers/preview-rules";
import { resumeSync, resumeSyncById } from "./controllers/resume-sync";
import {
  reviewSyncResume,
  reviewSyncResumeById,
} from "./controllers/review-resume";
import { saveSyncRules, saveSyncRulesById } from "./controllers/save-rules";
import {
  resumeBody,
  resumeBindingParams,
  resumeParams,
  resumePreviewSchema,
  rulesBody,
  saveRulesBody,
  syncBindingParams,
  syncParams,
  syncPreviewSchema,
} from "./schema";

const access = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ project: ["read"], task: ["read"] }),
];
const manage = [
  ...access,
  requireWorkspacePermission({ workspace: ["manage_settings"] }),
];
// RFC 0001 WP5: the binding-keyed routes authorize through the integration
// (WP1 fromIntegration) instead of the project. The permission split of the
// sync surface is unchanged: reads need project and task read, preview, save,
// review and resume also need workspace:manage_settings.
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
  403: errorResponse("No workspace access or required permission"),
  404: errorResponse("Integration or linked task not found"),
  409: errorResponse(
    "Configuration, impact or comparison changed; review again",
  ),
};
const path = "/project/{projectId}/{provider}";
const bindingPath = "/integration/{integrationId}";
const body = <T extends z.ZodType>(schema: T) => ({
  required: true as const,
  content: { "application/json": { schema } },
});

const getBindingRoute = createRoute({
  method: "get",
  path: bindingPath,
  operationId: "getIntegrationSyncRulesById",
  tags: ["Integration sync"],
  summary: "Get one binding's sync rules and current task scope",
  description:
    "Read the saved rules and scope of one repository binding (integrationId). Rules remain active when advanced mode is hidden. Each binding keeps its own rules, preview tokens, paused links and resume flow; a sibling binding of the same project is never affected.",
  middleware: bindingAccess,
  request: {
    params: syncBindingParams,
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
    "Returns matching tasks, new exports, paused links and a token bound to the addressed binding and impact. Preview tokens are scoped per binding and cannot be replayed against a sibling binding. Outgoing labels are workspace label IDs; incoming labels are exact repository label names.",
  middleware: bindingManage,
  request: {
    params: syncBindingParams,
    body: body(rulesBody),
  },
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
    "Save the rules of one repository binding (integrationId) only if the preview is still current. Excluded links are paused, never deleted; a sibling binding's rules are never touched. Newly matching unlinked tasks are exported through the integration event path. Paused links require explicit review to resume.",
  middleware: bindingManage,
  request: {
    params: syncBindingParams,
    body: body(saveRulesBody),
  },
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
  summary: "Compare a paused task with its external issue (one binding)",
  description:
    "The paused link must belong to the addressed binding; a sibling binding's link is not found. The comparison token is bound to the addressed binding's config.",
  middleware: bindingManage,
  request: { params: resumeBindingParams },
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
  summary: "Resume a reviewed issue link on one binding",
  description:
    "Explicitly choose the current Kaneo or repository title, description and open/closed state. Existing links are reused; historical comments are not replayed. The task must still match its outgoing rule. A changed comparison requires another review. The resume lease and scope locks are held per link and per binding.",
  middleware: [
    ...bindingManage,
    requireWorkspacePermission({ task: ["update"] }),
  ],
  request: {
    params: resumeBindingParams,
    body: body(resumeBody),
  },
  responses: {
    200: jsonResponse("Sync resumed", z.object({ success: z.boolean() })),
    ...errors,
    409: errorResponse(
      "Comparison changed or synchronization is busy; review or retry",
    ),
    502: errorResponse("External issue unavailable; sync remains paused"),
  },
});
const getRoute = createRoute({
  method: "get",
  path,
  operationId: "getIntegrationSyncRules",
  tags: ["Integration sync"],
  summary: "Get sync rules and current task scope",
  description:
    "Compatibility shim (RFC 0001 WP5): resolves the project's first binding of the provider (lowest createdAt) until the new web client ships. Use GET /integration/{integrationId}; this route is removed in the cleanup PR.",
  middleware: access,
  request: {
    params: syncParams,
    query: z.object({ after: z.string().optional() }),
  },
  responses: {
    200: jsonResponse("Saved rules and scope", syncPreviewSchema),
    ...errors,
  },
});
const previewRoute = createRoute({
  method: "post",
  path: `${path}/preview`,
  operationId: "previewIntegrationSyncRules",
  tags: ["Integration sync"],
  summary: "Preview a sync rule change",
  description:
    "Compatibility shim (RFC 0001 WP5): previews the project's first binding of the provider until the new web client ships. Use POST /integration/{integrationId}/preview; this route is removed in the cleanup PR.",
  middleware: manage,
  request: { params: syncParams, body: body(rulesBody) },
  responses: {
    200: jsonResponse("Proposed rule impact", syncPreviewSchema),
    ...errors,
  },
});
const saveRoute = createRoute({
  method: "patch",
  path,
  operationId: "saveIntegrationSyncRules",
  tags: ["Integration sync"],
  summary: "Apply a previewed sync rule",
  description:
    "Compatibility shim (RFC 0001 WP5): saves to the project's first binding of the provider until the new web client ships. Use PATCH /integration/{integrationId}; this route is removed in the cleanup PR.",
  middleware: manage,
  request: { params: syncParams, body: body(saveRulesBody) },
  responses: {
    200: jsonResponse("Saved rules and current scope", syncPreviewSchema),
    ...errors,
  },
});
const reviewRoute = createRoute({
  method: "get",
  path: `${path}/links/{linkId}/review`,
  operationId: "reviewIntegrationSyncResume",
  tags: ["Integration sync"],
  summary: "Compare a paused task with its external issue",
  description:
    "Compatibility shim (RFC 0001 WP5): reviews a link of the project's first binding of the provider until the new web client ships. Use GET /integration/{integrationId}/links/{linkId}/review; this route is removed in the cleanup PR.",
  middleware: manage,
  request: { params: resumeParams },
  responses: {
    200: jsonResponse(
      "Current values and comparison token",
      resumePreviewSchema,
    ),
    ...errors,
    502: errorResponse("External issue unavailable; sync remains paused"),
  },
});
const resumeRoute = createRoute({
  method: "post",
  path: `${path}/links/{linkId}/resume`,
  operationId: "resumeIntegrationSync",
  tags: ["Integration sync"],
  summary: "Resume a reviewed issue link",
  description:
    "Compatibility shim (RFC 0001 WP5): resumes a link of the project's first binding of the provider until the new web client ships. Use POST /integration/{integrationId}/links/{linkId}/resume; this route is removed in the cleanup PR.",
  middleware: [...manage, requireWorkspacePermission({ task: ["update"] })],
  request: { params: resumeParams, body: body(resumeBody) },
  responses: {
    200: jsonResponse("Sync resumed", z.object({ success: z.boolean() })),
    ...errors,
    409: errorResponse(
      "Comparison changed or synchronization is busy; review or retry",
    ),
    502: errorResponse("External issue unavailable; sync remains paused"),
  },
});

export default apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(getBindingRoute, async (c) => {
    const { integrationId } = c.req.valid("param");
    return c.json(
      await db.transaction(async (tx) => {
        const integration = await getSyncIntegrationById(integrationId, tx);
        // The middleware authorized the workspace at request start; a project
        // moved since then must not expose the destination's labels.
        await getAuthorizedSyncProject(
          integration.projectId,
          c.get("workspaceId"),
          tx,
          true,
        );
        return previewSyncRules(
          integration,
          readSyncRules(integration.config)!,
          tx,
          c.req.valid("query").after,
        );
      }),
      200,
    );
  })
  .openapi(previewBindingRoute, async (c) => {
    const { integrationId } = c.req.valid("param");
    return c.json(
      await db.transaction(async (tx) => {
        const integration = await getSyncIntegrationById(integrationId, tx);
        await getAuthorizedSyncProject(
          integration.projectId,
          c.get("workspaceId"),
          tx,
          true,
        );
        return previewSyncRules(integration, c.req.valid("json").rules, tx);
      }),
      200,
    );
  })
  .openapi(saveBindingRoute, async (c) => {
    const { integrationId } = c.req.valid("param");
    const { rules, previewToken } = c.req.valid("json");
    return c.json(
      await saveSyncRulesById(
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
    const review = await reviewSyncResumeById(
      integrationId,
      linkId,
      c.get("workspaceId"),
    );
    return c.json(
      {
        task: {
          id: review.task.id,
          number: review.task.number,
          title: review.task.title,
        },
        local: review.local,
        remote: review.remote,
        token: review.token,
      },
      200,
    );
  })
  .openapi(resumeBindingRoute, async (c) => {
    const { integrationId, linkId } = c.req.valid("param");
    const { source, token } = c.req.valid("json");
    return c.json(
      await resumeSyncById(
        integrationId,
        linkId,
        token,
        source,
        c.get("workspaceId"),
      ),
      200,
    );
  })
  .openapi(getRoute, async (c) => {
    const { projectId, provider } = c.req.valid("param");
    return c.json(
      await db.transaction(async (tx) => {
        await getAuthorizedSyncProject(
          projectId,
          c.get("workspaceId"),
          tx,
          true,
        );
        const integration = await getSyncIntegration(projectId, provider, tx);
        return previewSyncRules(
          integration,
          readSyncRules(integration.config)!,
          tx,
          c.req.valid("query").after,
        );
      }),
      200,
    );
  })
  .openapi(previewRoute, async (c) => {
    const { projectId, provider } = c.req.valid("param");
    return c.json(
      await db.transaction(async (tx) => {
        await getAuthorizedSyncProject(
          projectId,
          c.get("workspaceId"),
          tx,
          true,
        );
        return previewSyncRules(
          await getSyncIntegration(projectId, provider, tx),
          c.req.valid("json").rules,
          tx,
        );
      }),
      200,
    );
  })
  .openapi(saveRoute, async (c) => {
    const { projectId, provider } = c.req.valid("param");
    const { rules, previewToken } = c.req.valid("json");
    return c.json(
      await saveSyncRules(
        projectId,
        provider,
        rules,
        previewToken,
        c.get("workspaceId"),
      ),
      200,
    );
  })
  .openapi(reviewRoute, async (c) => {
    const { projectId, provider, linkId } = c.req.valid("param");
    const review = await reviewSyncResume(
      projectId,
      provider,
      linkId,
      c.get("workspaceId"),
    );
    return c.json(
      {
        task: {
          id: review.task.id,
          number: review.task.number,
          title: review.task.title,
        },
        local: review.local,
        remote: review.remote,
        token: review.token,
      },
      200,
    );
  })
  .openapi(resumeRoute, async (c) => {
    const { projectId, provider, linkId } = c.req.valid("param");
    const { source, token } = c.req.valid("json");
    return c.json(
      await resumeSync(
        projectId,
        provider,
        linkId,
        token,
        source,
        c.get("workspaceId"),
      ),
      200,
    );
  });
