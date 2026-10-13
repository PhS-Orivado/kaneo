import * as v from "valibot";
import { type SyncRules, syncRulesSchema } from "../sync/rules";

export const jiraConfigSchema = v.object({
  baseUrl: v.pipe(v.string(), v.url()),
  // cloud = Atlassian Basic auth (email + API token); dc = data center / server
  // personal access token sent as a Bearer token.
  authMode: v.picklist(["cloud", "dc"]),
  email: v.optional(v.pipe(v.string(), v.trim())),
  apiToken: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  projectKey: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  issueType: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty())),
  webhookSecret: v.optional(v.string()),
  syncRules: v.optional(
    v.custom<SyncRules>((value) => syncRulesSchema.safeParse(value).success),
  ),
  commentTaskLinkOnJiraIssue: v.optional(v.boolean()),
  // Optional column slug -> Jira status name mapping used for outbound
  // transitions when the target status category is not enough.
  statusMap: v.optional(v.record(v.string(), v.string())),
  selfAccountId: v.optional(v.string()),
  selfDisplayName: v.optional(v.string()),
});

export type JiraConfig = v.InferOutput<typeof jiraConfigSchema>;

export async function validateJiraConfig(
  config: unknown,
): Promise<{ valid: boolean; errors?: string[] }> {
  try {
    const parsed = v.parse(jiraConfigSchema, config);
    if (parsed.authMode === "cloud" && !parsed.email) {
      return {
        valid: false,
        errors: ["Cloud authentication requires the Atlassian account email"],
      };
    }
    return { valid: true };
  } catch (error) {
    if (error instanceof v.ValiError) {
      return {
        valid: false,
        errors: error.issues.map((issue) => issue.message),
      };
    }
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "Invalid config"],
    };
  }
}

export const defaultJiraConfig: Partial<JiraConfig> = {
  commentTaskLinkOnJiraIssue: true,
  issueType: "Task",
};

export function normalizeJiraBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  const parsed = new URL(trimmed);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Jira base URL must use http or https");
  }

  // A query or fragment would swallow the appended /rest/api/2/... path and
  // let a caller aim the request at an arbitrary path on the target host.
  if (parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error(
      "Jira base URL must not contain a query, fragment, or credentials",
    );
  }

  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

export function getDefaultJiraConfig({
  baseUrl,
  authMode,
  email,
  apiToken,
  projectKey,
  issueType,
  webhookSecret,
  selfAccountId,
  selfDisplayName,
}: {
  baseUrl: string;
  authMode: "cloud" | "dc";
  email?: string;
  apiToken: string;
  projectKey: string;
  issueType?: string;
  webhookSecret: string;
  selfAccountId?: string;
  selfDisplayName?: string;
}): JiraConfig {
  return {
    ...defaultJiraConfig,
    baseUrl: normalizeJiraBaseUrl(baseUrl),
    authMode,
    email,
    apiToken,
    projectKey,
    issueType: issueType ?? defaultJiraConfig.issueType,
    webhookSecret,
    ...(selfAccountId !== undefined ? { selfAccountId } : {}),
    ...(selfDisplayName !== undefined ? { selfDisplayName } : {}),
  };
}
