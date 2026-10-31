import findJiraLinks from "./find-jira-links";

export type JiraLinkTarget = {
  url: string;
  taskId: string;
  projectId: string;
};

export type JiraLinkReplacement = {
  sourceUrl: string;
  targetUrl: string;
  targetTaskId: string;
  targetProjectId: string;
};

export type JiraLinkRewriteResult = {
  text: string;
  replacements: JiraLinkReplacement[];
  unresolvedUrls: string[];
};

function rewriteJiraLinksInText(
  text: string,
  resolve: (projectKey: string, issueNumber: number) => JiraLinkTarget | null,
): JiraLinkRewriteResult {
  const matches = findJiraLinks(text);
  const replacements: JiraLinkReplacement[] = [];
  const unresolvedUrls: string[] = [];

  let rewritten = text;

  for (const match of [...matches].reverse()) {
    const target = resolve(match.projectKey, match.issueNumber);

    if (!target) {
      unresolvedUrls.push(match.url);
      continue;
    }

    rewritten =
      rewritten.slice(0, match.start) +
      target.url +
      rewritten.slice(match.start + match.url.length);
    replacements.push({
      sourceUrl: match.url,
      targetUrl: target.url,
      targetTaskId: target.taskId,
      targetProjectId: target.projectId,
    });
  }

  return {
    text: rewritten,
    replacements: replacements.reverse(),
    unresolvedUrls: unresolvedUrls.reverse(),
  };
}

export default rewriteJiraLinksInText;
