import type { GiteaConfig } from "../gitea/config";
import { createGiteaClient } from "../gitea/utils/gitea-api";
import type { GitHubConfig } from "../github/config";
import {
  formatIssueBody,
  formatTaskDescriptionFromIssue,
} from "../github/utils/format";
import { getVerifiedInstallationOctokit } from "../github/utils/github-app";
import type { GitlabConfig } from "../gitlab/config";
import { createGitlabClient } from "../gitlab/utils/gitlab-api";
import type { JiraConfig } from "../jira/config";
import { createJiraClient, type JiraIssue } from "../jira/utils/jira-api";
import {
  formatJiraDescription,
  formatTaskDescriptionFromJira,
} from "../jira/utils/format";

export type IssueValues = {
  title: string;
  description: string;
  state: "open" | "closed";
};

// Jira issue keys (PROJ-123) are not numbers, so the Jira branch runs before
// the numeric external id check. State is not writable here: it flows through
// workflow transitions on the status sync path.
function jiraProviderIssue(
  config: JiraConfig,
  link: { externalId: string; taskId: string },
) {
  const client = createJiraClient(config);
  const issueKey = link.externalId;
  const normalize = (issue: JiraIssue) => ({
    title: issue.fields.summary,
    description: formatTaskDescriptionFromJira(
      issue.fields.description ?? "",
      link.taskId,
    ),
    state:
      issue.fields.status?.statusCategory?.key === "done"
        ? ("closed" as const)
        : ("open" as const),
    updatedAt: issue.fields.updated ?? null,
    contentVersion: null,
    labels: issue.fields.labels ?? [],
  });
  return {
    read: async () => normalize(await client.getIssue(issueKey)),
    write: async (values: IssueValues) => {
      await client.editIssue(issueKey, {
        summary: values.title,
        description: formatJiraDescription(values.description, link.taskId),
      });
      return normalize(await client.getIssue(issueKey));
    },
  };
}

export async function providerIssue(
  integration: { type: string; config: string },
  link: { externalId: string; taskId: string },
) {
  const config = JSON.parse(integration.config);
  if (integration.type === "jira") {
    return jiraProviderIssue(config as JiraConfig, link);
  }
  const number = Number(link.externalId);
  if (!Number.isSafeInteger(number) || number <= 0)
    throw new Error("Invalid issue number");
  const owner = config.repositoryOwner;
  const repo = config.repositoryName;
  const normalize = (issue: {
    title: string;
    body?: string | null;
    description?: string | null;
    state: string;
    updated_at?: string;
    content_version?: number;
    labels?: Array<string | { name?: string }>;
  }) => ({
    title: issue.title,
    description: formatTaskDescriptionFromIssue(
      issue.body ?? issue.description ?? "",
      link.taskId,
    ),
    state: issue.state === "closed" ? ("closed" as const) : ("open" as const),
    updatedAt: issue.updated_at ?? null,
    contentVersion: issue.content_version ?? null,
    labels: (issue.labels ?? []).flatMap((label) => {
      const name = typeof label === "string" ? label : label.name;
      return name ? [name] : [];
    }),
  });
  if (integration.type === "gitea") {
    const client = createGiteaClient(config as GiteaConfig);
    let contentVersion: number | undefined;
    return {
      read: async () => {
        const issue = await client.getIssue(owner, repo, number);
        contentVersion = issue.content_version;
        return normalize(issue);
      },
      write: async (values: IssueValues) =>
        normalize(
          await client.updateIssue(owner, repo, number, {
            title: values.title,
            body: formatIssueBody(values.description, link.taskId),
            state: values.state,
            ...(contentVersion === undefined
              ? {}
              : { content_version: contentVersion }),
          }),
        ),
    };
  }
  if (integration.type === "gitlab") {
    const client = createGitlabClient(config as GitlabConfig);
    return {
      read: async () => {
        const issue = await client.getIssue(config.projectPath, number);
        if (issue.confidential)
          throw new Error("Confidential issue cannot be synchronized");
        return normalize(issue);
      },
      write: async (values: IssueValues) =>
        normalize(
          await client.updateIssue(config.projectPath, number, {
            title: values.title,
            description: formatIssueBody(values.description, link.taskId),
            state_event: values.state === "closed" ? "close" : "reopen",
          }),
        ),
    };
  }
  const octokit = await getVerifiedInstallationOctokit(
    config as GitHubConfig,
    true,
  );
  return {
    read: async () =>
      normalize(
        (
          await octokit.rest.issues.get({
            owner,
            repo,
            issue_number: number,
            request: { timeout: 10_000 },
          })
        ).data,
      ),
    write: async (values: IssueValues) =>
      normalize(
        (
          await octokit.rest.issues.update({
            owner,
            repo,
            issue_number: number,
            title: values.title,
            body: formatIssueBody(values.description, link.taskId),
            state: values.state,
            request: { timeout: 10_000 },
          })
        ).data,
      ),
  };
}
