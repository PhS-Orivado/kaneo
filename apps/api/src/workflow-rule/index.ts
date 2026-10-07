import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import {
  workspaceAccess,
  workspaceAccessMiddleware,
} from "../utils/workspace-access-middleware";
import deleteWorkflowRule from "./controllers/delete-workflow-rule";
import getWorkflowRules from "./controllers/get-workflow-rules";
import upsertWorkflowRule from "./controllers/upsert-workflow-rule";
import { workflowRuleListSchema, workflowRuleRowSchema } from "./response";
import {
  projectIdParam,
  upsertWorkflowRuleBody,
  workflowRuleParam,
} from "./schema";

// RFC 0001 WP6: when the body targets a repository binding, the binding is
// the addressed resource and authorizes the request (WP1: 404 for an
// unknown integration id, 403 for a binding of a foreign workspace) before
// the project-keyed fallback authorizes type-wide rules, whose body carries
// no integrationId.
const ruleAccess = workspaceAccessMiddleware({
  sources: [
    { type: "lookup", resource: "integration", idKey: "integrationId" },
    { type: "lookup", resource: "project", idKey: "projectId" },
  ],
});

const getWorkflowRulesRoute = createRoute({
  method: "get",
  operationId: "getWorkflowRules",
  path: "/{projectId}",
  tags: ["Workflow Rules"],
  summary: "Get workflow rules",
  description:
    "Get every workflow rule for a project, including each rule's scope: a rule with an integrationId targets one repository binding, a rule without one applies to every repository of that integration type (RFC 0001 WP6).",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("List of workflow rules", workflowRuleListSchema),
    400: errorResponse(
      "Unknown project, or its workspace could not be determined",
    ),
    403: errorResponse("No access to the project's workspace"),
  },
});

const upsertWorkflowRuleRoute = createRoute({
  method: "put",
  operationId: "upsertWorkflowRule",
  path: "/{projectId}",
  tags: ["Workflow Rules"],
  summary: "Upsert workflow rule",
  description:
    "Create a workflow rule, or update the target column of the existing rule for the same integration and event. An optional integrationId scopes the rule to one repository binding; without it the rule stays type-wide and applies to every repository of that integration type in the project. A repository-specific rule and a type-wide rule for the same event coexist; resolution prefers the repository-specific one.",
  middleware: [
    ruleAccess,
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: upsertWorkflowRuleBody } },
    },
  },
  responses: {
    200: jsonResponse("The created or updated rule", workflowRuleRowSchema),
    400: errorResponse(
      "Invalid body, unknown project, or the integration does not belong to the project or its type does not match",
    ),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
    404: errorResponse("Integration not found"),
  },
});

const deleteWorkflowRuleRoute = createRoute({
  method: "delete",
  operationId: "deleteWorkflowRule",
  path: "/{id}",
  tags: ["Workflow Rules"],
  summary: "Delete workflow rule",
  description: "Delete a workflow rule. Returns the rule that was removed.",
  middleware: [
    workspaceAccess.fromWorkflowRule("id"),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: { params: workflowRuleParam },
  responses: {
    200: jsonResponse("The deleted rule", workflowRuleRowSchema),
    400: errorResponse(
      "Unknown rule, or its workspace could not be determined",
    ),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
  },
});

const workflowRule = apiRouter()
  .openapi(getWorkflowRulesRoute, async (c) =>
    c.json(await getWorkflowRules(c.req.valid("param").projectId), 200),
  )
  .openapi(upsertWorkflowRuleRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const { integrationType, integrationId, eventType, columnId } =
      c.req.valid("json");
    return c.json(
      await upsertWorkflowRule({
        projectId,
        integrationType,
        integrationId: integrationId ?? null,
        eventType,
        columnId,
      }),
      200,
    );
  })
  .openapi(deleteWorkflowRuleRoute, async (c) =>
    c.json(await deleteWorkflowRule(c.req.valid("param").id), 200),
  );

export default workflowRule;
