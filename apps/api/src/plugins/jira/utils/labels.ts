import type { IssueWrite } from "../../sync/issue-write";
import type { JiraConfig } from "../config";
import { createJiraClient } from "./jira-api";

// Jira issue labels are plain strings on fields.labels, so adding or removing
// one rewrites the whole array through a single edit. The read-modify-write
// runs under the caller's IssueWrite so echo bookkeeping stays consistent.
export async function addLabelsToIssueJira(
  config: JiraConfig,
  issueKey: string,
  labelNames: string[],
  requireSuccess = false,
  write: IssueWrite = (send) => send(),
) {
  if (labelNames.length === 0) return;

  const client = createJiraClient(config);

  try {
    const issue = await client.getIssue(issueKey, "labels");
    const current = issue.fields.labels ?? [];
    const missing = labelNames.filter((name) => !current.includes(name));
    if (missing.length === 0) return;

    await write(() =>
      client.editIssue(issueKey, {
        labels: [...current, ...missing],
      }),
    );
  } catch (error) {
    if (requireSuccess) throw error;
    console.error("Failed to add labels to Jira issue:", {
      issueKey,
      labelNames,
      error,
    });
  }
}

export async function removeLabelJira(
  config: JiraConfig,
  issueKey: string,
  labelName: string,
  write: IssueWrite = (send) => send(),
  requireSuccess = false,
) {
  const client = createJiraClient(config);

  try {
    const issue = await client.getIssue(issueKey, "labels");
    const current = issue.fields.labels ?? [];
    if (!current.includes(labelName)) return;

    await write(() =>
      client.editIssue(issueKey, {
        labels: current.filter((name) => name !== labelName),
      }),
    );
  } catch (error) {
    if (requireSuccess) throw error;
    console.error("Failed to remove label from Jira issue:", {
      issueKey,
      labelName,
      error,
    });
  }
}
