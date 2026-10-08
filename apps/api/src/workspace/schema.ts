import { PROJECT_ACCESS_MODES } from "../project-access/project-access-mode";
import { z } from "../openapi";

export const workspaceIdParam = z.object({ workspaceId: z.string() });

export const workspaceMemberParam = z.object({
  workspaceId: z.string(),
  userId: z.string(),
});

export const workspaceMembersQuery = z.object({
  projectId: z.string().optional().openapi({
    description:
      "Only return members who can access this project, for example to fill an assignee picker.",
  }),
});

export const updateMemberProjectAccessBody = z.object({
  projectAccess: z.enum(PROJECT_ACCESS_MODES).openapi({
    description:
      '"all" gives access to every project in the workspace, including future ones. "selected" limits the member to projectIds.',
  }),
  projectIds: z.array(z.string()).default([]).openapi({
    description:
      'Projects the member can access when projectAccess is "selected".',
  }),
});

export const createWorkspaceInvitationsBody = z.object({
  role: z.string().default("member").openapi({
    description:
      "Workspace role granted when an invitation is accepted. Owner cannot be granted by invitation; add the user and transfer ownership instead.",
  }),
  invitations: z
    .array(
      z.object({
        email: z.email().openapi({
          description:
            "The invitee's email address, lowercased before use.",
        }),
        sendEmail: z.boolean().default(false).openapi({
          description:
            "Send the standard workspace invitation email to this address. The invitation is always created; leave this false to share the link manually.",
        }),
      }),
    )
    .min(1)
    .max(100)
    .openapi({
      description: "Email addresses to invite. Up to 100 per request.",
    }),
});
