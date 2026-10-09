import { PROJECT_ACCESS_MODES } from "../project-access/project-access-mode";
import { z } from "../openapi";

export const workspaceMemberSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    role: z.string().openapi({
      description:
        "The member's workspace role: a built-in role (owner, admin, member, guest) or a custom role name.",
    }),
  })
  .openapi("WorkspaceMember");

export const workspaceMemberListSchema = z.array(workspaceMemberSchema);

export const memberProjectAccessSchema = z
  .object({
    userId: z.string(),
    projectAccess: z.enum(PROJECT_ACCESS_MODES),
    projectIds: z.array(z.string()),
  })
  .openapi("MemberProjectAccess");

export const memberProjectAccessListSchema = z
  .array(memberProjectAccessSchema)
  .openapi({
    description:
      "Members limited to selected projects. Members not listed can access every project. Project IDs only include projects the caller can access.",
  });

export const workspaceInvitationResultSchema = z
  .object({
    email: z.string(),
    status: z
      .enum(["created", "already_member", "already_invited", "error"])
      .openapi({
        description:
          '"created": a new pending invitation. "already_member": the email belongs to a current member, nothing was created. "already_invited": an unexpired pending invitation already exists and was reused; its expiry is refreshed when it was re-sent. "error": no invitation was created, see error.',
      }),
    id: z.string().optional().openapi({
      description:
        "Invitation id, present whenever an invitation exists for this email.",
    }),
    expiresAt: z.string().optional().openapi({
      description:
        "When the invitation expires. Like invitations sent from the app, it stays valid for 48 hours.",
    }),
    emailed: z.boolean().openapi({
      description:
        "Whether the standard workspace invitation email was sent for this invitation.",
    }),
    error: z.string().optional().openapi({
      description:
        'Failure reason when status is "error", or why the invitation email could not be sent.',
    }),
  })
  .openapi("WorkspaceInvitationResult");

export const workspaceInvitationListSchema = z
  .object({
    invitations: z.array(workspaceInvitationResultSchema),
  })
  .openapi("WorkspaceInvitationList");
