export type JiraLinkMatch = {
  url: string;
  projectKey: string;
  issueNumber: number;
  start: number;
};

const jiraBrowsePattern =
  /https?:\/\/[^\s"'<>]+\/browse\/([A-Za-z][A-Za-z0-9]*)-(\d+)/g;

function findJiraLinks(text: string): JiraLinkMatch[] {
  const matches: JiraLinkMatch[] = [];

  for (const match of text.matchAll(jiraBrowsePattern)) {
    matches.push({
      url: match[0],
      projectKey: match[1],
      issueNumber: Number(match[2]),
      start: match.index ?? 0,
    });
  }

  return matches;
}

export default findJiraLinks;
