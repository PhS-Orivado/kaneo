import { pagingNumber, z } from "../openapi";

export const listAdminUsersQuery = z.object({
  search: z.string().max(200).optional().openapi({
    description: "Case-insensitive match against user name or email.",
  }),
  page: pagingNumber(1, 1_000_000, 1),
  limit: pagingNumber(1, 100, 20),
});

export const listAdminWorkspacesQuery = z.object({
  search: z.string().max(200).optional().openapi({
    description: "Case-insensitive match against workspace name or slug.",
  }),
  page: pagingNumber(1, 1_000_000, 1),
  limit: pagingNumber(1, 100, 20),
});

export const adminWorkspaceParam = z.object({ workspaceId: z.string() });

export const adminWorkspaceMemberParam = z.object({
  workspaceId: z.string(),
  userId: z.string(),
});

const assignableRole = z.string().min(1).max(100).openapi({
  description:
    "A built-in role (viewer, member, admin) or one of the workspace's custom roles. Use the ownership endpoint to make someone the owner.",
});

export const addAdminWorkspaceMemberBody = z.object({
  userId: z.string().min(1),
  role: assignableRole,
});

export const updateAdminWorkspaceMemberRoleBody = z.object({
  role: assignableRole,
});

export const transferAdminWorkspaceOwnershipBody = z.object({
  userId: z.string().min(1).openapi({
    description:
      "An existing member who becomes the only owner. Previous owners become admins.",
  }),
});

const brandingUrl = (description: string) =>
  z.string().url().max(2048).nullable().openapi({ description });

export const updateBrandingBody = z.object({
  appName: z.string().max(100).nullable().openapi({
    description: "Custom application name. Null keeps the default Kaneo name.",
  }),
  logoLightUrl: brandingUrl(
    "Logo image URL for the light theme. Null keeps the default logo.",
  ),
  logoDarkUrl: brandingUrl(
    "Logo image URL for the dark theme. Null keeps the default logo.",
  ),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb hex color")
    .nullable()
    .openapi({
      description:
        "Accent color as a #rrggbb hex value. Null keeps the default color.",
    }),
  footerText: z.string().max(200).nullable().openapi({
    description:
      "Custom footer text replacing the 'Powered by Kaneo' wording. Null keeps the default.",
  }),
  footerUrl: brandingUrl(
    "Link target for the footer branding on public pages. Defaults to kaneo.app.",
  ),
  termsUrl: brandingUrl(
    "Terms of service URL shown on the sign-in screen. Defaults to kaneo.app/terms.",
  ),
  privacyUrl: brandingUrl(
    "Privacy policy URL shown on the sign-in screen. Defaults to kaneo.app/privacy.",
  ),
  showPoweredBy: z.boolean().openapi({
    description: "Whether the Kaneo attribution appears on public pages.",
  }),
});
