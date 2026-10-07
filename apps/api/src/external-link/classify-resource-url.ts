/**
 * Classification of user-pasted resource URLs so a pasted pull request link
 * shows up as a pull request on the task instead of a plain URL. Pure
 * functions only: no database, no provider calls.
 */

export type ClassifiedResource =
  | { resourceType: "pull_request"; externalId: string }
  | { resourceType: "branch"; externalId: string }
  | { resourceType: "url"; externalId: null };

const GITHUB_PULL_REQUEST =
  /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:\/\S*)?$/i;
const GITHUB_BRANCH =
  /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/tree\/(.+)$/i;
const GITEA_PULL_REQUEST =
  /^https?:\/\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/pulls\/(\d+)(?:\/\S*)?$/i;
const GITEA_BRANCH =
  /^https?:\/\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/src\/branch\/(.+)$/i;
const GITLAB_MERGE_REQUEST =
  /^https?:\/\/([^/\s]+)\/(.+)\/-\/merge_requests\/(\d+)(?:\/\S*)?$/i;
const GITLAB_BRANCH = /^https?:\/\/([^/\s]+)\/(.+)\/-\/tree\/(.+)$/i;

/** Query and fragment never belong to a resource id. */
function withoutQueryAndFragment(url: string): string {
  return url.replace(/[?#].*$/, "");
}

export function classifyResourceUrl(url: string): ClassifiedResource {
  const path = withoutQueryAndFragment(url).replace(/\/+$/, "");

  const githubPr = path.match(GITHUB_PULL_REQUEST);
  if (githubPr) {
    return { resourceType: "pull_request", externalId: githubPr[3] };
  }

  const giteaPr = path.match(GITEA_PULL_REQUEST);
  if (giteaPr) {
    return { resourceType: "pull_request", externalId: giteaPr[4] };
  }

  const gitlabMr = path.match(GITLAB_MERGE_REQUEST);
  if (gitlabMr) {
    return { resourceType: "pull_request", externalId: gitlabMr[3] };
  }

  // Tree URLs carry the branch name after /tree/. Branch names may contain
  // slashes (fix/EC-123), so everything after the prefix is captured; a
  // pasted file path inside the tree becomes part of the id and is better
  // linked through the branch search instead.
  const githubBranch = path.match(GITHUB_BRANCH);
  if (githubBranch) {
    return { resourceType: "branch", externalId: githubBranch[3] };
  }

  const giteaBranch = path.match(GITEA_BRANCH);
  if (giteaBranch) {
    return { resourceType: "branch", externalId: giteaBranch[4] };
  }

  const gitlabBranch = path.match(GITLAB_BRANCH);
  if (gitlabBranch) {
    return { resourceType: "branch", externalId: gitlabBranch[3] };
  }

  return { resourceType: "url", externalId: null };
}
