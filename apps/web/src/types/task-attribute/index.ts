// RFC 0002: a workspace-level task attribute (task type such as task, bug or
// doc) with its symbol and colors. Full definitions are managed in the
// workspace settings; task payloads embed the compact TaskAttributeRef.

export type TaskAttributeRef = {
  id: string;
  name: string;
  icon: string;
  iconColor: string;
  textColor: string;
};

type TaskAttribute = TaskAttributeRef & {
  workspaceId: string;
  description: string | null;
  position: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export default TaskAttribute;
