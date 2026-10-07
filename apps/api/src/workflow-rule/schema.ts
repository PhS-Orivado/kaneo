import { z } from "../openapi";

export const projectIdParam = z.object({ projectId: z.string() });

export const workflowRuleParam = z.object({ id: z.string() });

export const upsertWorkflowRuleBody = z.object({
  integrationType: z.string(),
  // RFC 0001 WP6: when set, the rule targets one repository binding
  // instead of every repository of that type in the project.
  integrationId: z.string().min(1).max(128).optional(),
  eventType: z.string(),
  columnId: z.string(),
});
