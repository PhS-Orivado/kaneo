export type JiraResolverProject = {
  id: string;
  slug: string;
};

export type JiraResolverTask = {
  id: string;
  projectId: string;
  number: number;
};

export type JiraResolvedTask = {
  taskId: string;
  projectId: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildJiraLinkResolver(
  projects: JiraResolverProject[],
  tasks: JiraResolverTask[],
) {
  const tasksByProjectId = new Map<string, JiraResolverTask[]>();

  for (const task of tasks) {
    const bucket = tasksByProjectId.get(task.projectId);
    if (bucket) bucket.push(task);
    else tasksByProjectId.set(task.projectId, [task]);
  }

  const projectBySlug = new Map<string, JiraResolverProject>();

  for (const project of projects) {
    const lowerSlug = project.slug.toLowerCase();

    if (!projectBySlug.has(lowerSlug)) {
      projectBySlug.set(lowerSlug, project);
    }
  }

  return (projectKey: string, issueNumber: number): JiraResolvedTask | null => {
    const key = projectKey.toLowerCase();

    const findTask = (project: JiraResolverProject) => {
      const task = (tasksByProjectId.get(project.id) ?? []).find(
        (entry) => entry.number === issueNumber,
      );

      return task ? { taskId: task.id, projectId: project.id } : null;
    };

    const exact = projectBySlug.get(key);

    if (exact) {
      const resolved = findTask(exact);

      if (resolved) return resolved;
    }

    const suffixPattern = new RegExp(`^${escapeRegExp(key)}-\\d+$`);

    const candidates: JiraResolvedTask[] = [];

    for (const project of projects) {
      if (project === exact) continue;
      if (!suffixPattern.test(project.slug.toLowerCase())) continue;

      const resolved = findTask(project);
      if (resolved) candidates.push(resolved);
    }

    return candidates.length === 1 ? candidates[0] : null;
  };
}

export default buildJiraLinkResolver;
