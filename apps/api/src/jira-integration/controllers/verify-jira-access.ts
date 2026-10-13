import { HTTPException } from "hono/http-exception";
import { normalizeJiraBaseUrl } from "../../plugins/jira/config";
import {
  createJiraClient,
  JiraApiError,
  verifyJiraToken,
} from "../../plugins/jira/utils/jira-api";

async function verifyJiraAccess({
  baseUrl,
  authMode,
  email,
  apiToken,
  projectKey,
}: {
  baseUrl: string;
  authMode: "cloud" | "dc";
  email?: string;
  apiToken: string;
  projectKey: string;
}) {
  try {
    const normalized = normalizeJiraBaseUrl(baseUrl);
    try {
      await verifyJiraToken({
        baseUrl: normalized,
        authMode,
        email,
        apiToken,
      });
    } catch (error) {
      // A 404 from /myself means the URL does not point at a Jira instance,
      // not a project lookup failure.
      if (error instanceof JiraApiError && error.status === 404) {
        return {
          isInstalled: false,
          hasRequiredPermissions: false,
          projectExists: false,
          missingPermissions: [] as string[],
          message: "The URL does not point to a Jira instance.",
          failureReason: "not_a_jira_instance" as const,
        };
      }
      throw error;
    }

    const client = createJiraClient({
      baseUrl: normalized,
      authMode,
      email,
      apiToken,
    });

    // Jira has no coarse "can manage issues" flag: the project lookup is the
    // permission check. A 404 hides projects the token cannot see, and an
    // empty response means the token cannot create issues there.
    try {
      await client.getProject(projectKey);
    } catch (error) {
      if (error instanceof JiraApiError && error.status === 404) {
        return {
          isInstalled: true,
          hasRequiredPermissions: false,
          projectExists: false,
          missingPermissions: [] as string[],
          message:
            "Project not found or not accessible with these credentials.",
          failureReason: "project_not_found" as const,
        };
      }
      throw error;
    }

    return {
      isInstalled: true,
      hasRequiredPermissions: true,
      projectExists: true,
      missingPermissions: [] as string[],
      message: "Credentials can access the Jira project.",
      failureReason: null,
    };
  } catch (error) {
    if (error instanceof JiraApiError) {
      if (error.kind === "REDIRECT") {
        return {
          isInstalled: false,
          hasRequiredPermissions: false,
          projectExists: false,
          missingPermissions: [] as string[],
          message: `The Jira URL redirected (HTTP ${error.status}). This usually means the server forces HTTPS. Please use the final URL directly.`,
          failureReason: "redirected" as const,
        };
      }

      if (error.kind === "INVALID_JSON") {
        return {
          isInstalled: false,
          hasRequiredPermissions: false,
          projectExists: false,
          missingPermissions: [] as string[],
          message: "The URL does not point to a Jira instance.",
          failureReason: "not_a_jira_instance" as const,
        };
      }

      if (error.status === 401) {
        throw new HTTPException(400, {
          message: "Invalid Jira credentials or unauthorized.",
        });
      }
    }

    throw new HTTPException(500, {
      message:
        error instanceof Error ? error.message : "Failed to verify Jira access",
    });
  }
}

export default verifyJiraAccess;
