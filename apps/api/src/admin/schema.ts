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

const configText = (description: string) =>
  z.string().max(500).nullable().openapi({ description });

const configSecret = (description: string) =>
  z.string().max(500).nullable().openapi({ description });

export const updateInstanceConfigBody = z.object({
  smtp: z.object({
    host: configText("SMTP server host. Null clears the override."),
    port: z
      .number()
      .int()
      .min(1)
      .max(65535)
      .nullable()
      .openapi({
        description:
          "SMTP server port. Null lets the mail library pick the default for the security mode.",
      }),
    secure: z.boolean().openapi({
      description: "Connect over TLS from the start (port 465 style).",
    }),
    requireTls: z.boolean().openapi({
      description: "Require STARTTLS upgrade on plaintext connections.",
    }),
    user: configText("SMTP authentication user. Null clears it."),
    password: configSecret(
      "SMTP authentication password. Null keeps the current value.",
    ),
    from: configText("Envelope sender address, for example no-reply@example.com."),
  }),
  s3: z.object({
    endpoint: configText("S3-compatible endpoint URL. Null clears it."),
    region: configText("Bucket region. Defaults to us-east-1 when empty."),
    bucket: configText("Bucket name. Null clears it."),
    accessKeyId: configText("Static access key id. Null clears it."),
    secretAccessKey: configSecret(
      "Static secret access key. Null keeps the current value.",
    ),
    publicBaseUrl: configText(
      "Base URL objects are served from, for CDN fronts. Null clears it.",
    ),
    keyPrefix: configText("Prefix prepended to object keys. Null clears it."),
    forcePathStyle: z.boolean().openapi({
      description:
        "Use path-style URLs instead of virtual hosts (needed by most self-hosted S3-compatible stores).",
    }),
  }),
});
