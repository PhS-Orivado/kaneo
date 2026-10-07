import fs from "node:fs/promises";

// RFC 0001 WP7: adds the repository-binding settings surface keys to en-US.
// Every key is inserted only when absent, so a key that already exists keeps
// its reviewed wording. check.mjs --fix propagates the values to every locale
// and schema.mjs regenerates the locale schema.
const KEYS = {
  settings: {
    repositoryBindings: {
      addFirstTitle: "Connect your first repository",
      addFirstHint:
        "Bind a repository to sync its issues and pull requests into this project.",
      listTitle: "Connected repositories",
      addMore: "Add repository",
      listError: "The repository bindings could not be loaded.",
      listEmpty: "No repository is connected yet.",
      rowMenuLabel: "Actions for {{repository}}",
      openRepository: "Open {{repository}}",
      importMeta:
        "{{imported}} imported, {{updated}} updated, {{skipped}} skipped",
      statusActive: "Active",
      statusPaused: "Paused",
      statusNeedsVerification: "Needs verification",
      actionSettings: "Binding settings",
      actionSyncRules: "Sync rules",
      actionWorkflowRules: "Workflow rules",
      actionImportIssues: "Import issues",
      actionDisconnect: "Disconnect",
      usageUnlimited: "{{used}} repositories",
      usageLimited: "{{used}} of {{limit}} repositories",
      settingsTitle: "Binding settings",
      commentTaskLinkTitle: "Comment task link",
      commentTaskLinkHint:
        "Post a comment with a link to the task on every synced issue.",
      webhookTitle: "Webhook",
      webhookHint:
        "Kaneo signs every webhook event it sends with this secret so the provider can verify the source.",
      webhookSecretLabel: "Webhook secret",
      webhookHide: "Hide secret",
      webhookShow: "Show secret",
      webhookCopy: "Copy secret",
      toast: {
        secretCopied: "Webhook secret copied to the clipboard.",
        unableToCopySecret: "The webhook secret could not be copied.",
        added: "Repository connected.",
      },
      syncRulesTitle: "Sync rules",
      syncRulesHint: "These sync rules apply to {{repository}} only.",
      workflowRulesTitle: "Workflow rules",
      workflowRulesHint: "These workflow rules apply to {{repository}} only.",
      disconnectTitle: "Disconnect repository",
      disconnectDescription:
        "{{provider}} stops syncing {{repository}} with this project. Already synced tasks stay.",
      disconnectWorking: "Disconnecting...",
      disconnectConfirm: "Disconnect",
      addRepositoryTitle: "Add repository",
      addRepositoryHint:
        "Enter the instance URL and an access token, or pick a repository you can access.",
      browseRepositories: "Browse repositories",
      upgrade: "Upgrade plan",
      dismissError: "Dismiss",
      linkedInProject: "Linked in this project",
      linkedInOtherProject: "Linked in {{project}}",
      linkedInUnknownProject: "Linked in another project",
    },
    workflowEditor: {
      scopeLabel: "Repository scope",
      scopeTypeWide: "Every repository",
      bindingScopeHint: "This rule applies to {{repository}} only.",
      typeWideScopeHint:
        "This rule applies to every repository of this provider. A rule scoped to a repository takes precedence.",
    },
    githubIntegration: {
      providerName: "GitHub",
    },
    giteaIntegration: {
      providerName: "Gitea",
      browseModalTitle: "Select a repository",
      browseModalHint: "Pick a repository from the Gitea instance.",
      searchRepos: "Search repositories...",
      browseNeedsCredentials:
        "Enter the instance URL and an access token to browse repositories.",
      loadingRepos: "Loading repositories...",
    },
    gitlabIntegration: {
      providerName: "GitLab",
      browseModalTitle: "Select a project",
      browseModalHint: "Pick a project from the GitLab instance.",
      searchProjects: "Search projects...",
      browseNeedsCredentials:
        "Enter the instance URL and an access token to browse projects.",
      loadingProjects: "Loading projects...",
      loadProjectsError: "The projects could not be loaded.",
      retry: "Retry",
      openInGitlab: "Open in GitLab",
      tokenTypeLabel: "Token type",
      tokenTypeHint: "Personal, project and group access tokens are supported.",
      tokenTypePrivate: "Private token",
      tokenTypeBearer: "Bearer token",
    },
    repositoryBrowser: {
      title: "Select a repository",
      description:
        "Pick a repository your GitHub App installation can access.",
      searchPlaceholder: "Search repositories...",
      loadError: "The repositories could not be loaded.",
      tryAgain: "Try again",
      emptyTitle: "No repositories yet",
      emptyHint: "Install the GitHub App on a repository to list it here.",
      installGithubApp: "Install the GitHub App",
      updatedPrefix: "Updated",
      noSearchMatchTitle: "No match",
      noSearchMatchHint: "No repository matches your search.",
      footerSummary:
        "{{repoCount}} repositories across {{installationCount}} installations",
      manageInstallations: "Manage installations",
      relativeJustNow: "just now",
      relativeMinutesAgo: "{{count}} minutes ago",
      relativeHoursAgo: "{{count}} hours ago",
      relativeDaysAgo: "{{count}} days ago",
    },
  },
};

const enPath = "i18n/en-US.json";
const en = JSON.parse(await fs.readFile(enPath, "utf8"));

let inserted = 0;
function insert(target, additions) {
  for (const [key, value] of Object.entries(additions)) {
    if (target[key] === undefined) {
      target[key] = value;
      inserted += 1;
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target[key] !== null &&
      typeof target[key] === "object"
    ) {
      insert(target[key], value);
    }
  }
}

insert(en, KEYS);
await fs.writeFile(enPath, `${JSON.stringify(en, null, "\t")}\n`);
console.log(`Inserted ${inserted} keys into ${enPath}`);
