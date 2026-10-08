import type { JiraTransition } from "./jira-api";

// Jira workflows expose transitions, not direct status writes, so outbound
// state changes pick a transition whose target matches. The binding's
// statusMap names a concrete Jira status; otherwise the target status
// category decides (done closes, anything else reopens).
export function findTransitionByName(
  transitions: JiraTransition[],
  statusName: string,
): JiraTransition | undefined {
  const wanted = statusName.trim().toLowerCase();
  return transitions.find(
    (transition) => transition.to?.name?.trim().toLowerCase() === wanted,
  );
}

export function findTransitionToStatusCategory(
  transitions: JiraTransition[],
  categoryKey: string,
): JiraTransition | undefined {
  return transitions.find(
    (transition) =>
      transition.to?.statusCategory?.key === categoryKey,
  );
}

export function issueIsClosed(statusCategoryKey: string | undefined): boolean {
  return statusCategoryKey === "done";
}
