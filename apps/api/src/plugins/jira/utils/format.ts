import { normalizeJiraBaseUrl } from "../config";

// Jira descriptions are plain text (REST v2), so the Kaneo origin footer is a
// stable text suffix rather than HTML. Only the exact suffix for the linked
// task is ever stripped; arbitrary "Task:" mentions remain untouched.
function jiraTaskFooter(taskId: string): string {
  return `Task: ${taskId}`;
}

export function formatJiraDescription(
  taskDescription: string | null,
  taskId: string,
): string {
  const description = taskDescription || "";

  if (!description.trim()) {
    return jiraTaskFooter(taskId);
  }

  return `${description}\n\n----\n${jiraTaskFooter(taskId)}`;
}

export function formatTaskDescriptionFromJira(
  issueDescription: string | null | undefined,
  taskId?: string,
): string {
  const body = issueDescription || "";
  if (!taskId) return body;
  const footer = jiraTaskFooter(taskId);
  if (body === footer) return "";
  const suffix = `\n\n----\n${footer}`;
  return body.endsWith(suffix) ? body.slice(0, -suffix.length) : body;
}

export function jiraIssueBrowseUrl(baseUrl: string, issueKey: string): string {
  return `${normalizeJiraBaseUrl(baseUrl)}/browse/${encodeURIComponent(issueKey)}`;
}

export function jiraCommentUrl(
  baseUrl: string,
  issueKey: string,
  commentId: string,
): string {
  return `${jiraIssueBrowseUrl(baseUrl, issueKey)}?focusedCommentId=${encodeURIComponent(commentId)}`;
}
