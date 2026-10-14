import { z } from "../openapi";

export const brandingSchema = z
  .object({
    appName: z.string().nullable().openapi({
      description:
        "Custom application name. Null keeps the default Kaneo name.",
    }),
    logoLightUrl: z.string().nullable().openapi({
      description:
        "Logo image URL for the light theme. Null keeps the default logo.",
    }),
    logoDarkUrl: z.string().nullable().openapi({
      description:
        "Logo image URL for the dark theme. Null keeps the default logo.",
    }),
    accentColor: z.string().nullable().openapi({
      description:
        "Accent color as a #rrggbb hex value. Null keeps the default color.",
    }),
    footerText: z.string().nullable().openapi({
      description:
        "Custom footer text replacing the 'Powered by Kaneo' wording. Null keeps the default.",
    }),
    footerUrl: z.string().nullable().openapi({
      description:
        "Link target for the footer branding on public pages. Defaults to kaneo.app.",
    }),
    termsUrl: z.string().nullable().openapi({
      description:
        "Terms of service URL shown on the sign-in screen. Defaults to kaneo.app/terms.",
    }),
    privacyUrl: z.string().nullable().openapi({
      description:
        "Privacy policy URL shown on the sign-in screen. Defaults to kaneo.app/privacy.",
    }),
    showPoweredBy: z.boolean().openapi({
      description:
        "Whether the Kaneo attribution appears on public pages.",
    }),
  })
  .openapi("Branding");

export const configSchema = z
  .object({
    isCloud: z.boolean(),
    disableRegistration: z.boolean(),
    disablePasswordRegistration: z.boolean(),
    disableEmailOtpSignIn: z.boolean(),
    disableWorkspaceCreation: z.boolean(),
    isDemoMode: z.boolean(),
    hasSmtp: z.boolean(),
    hasImageUploads: z.boolean().openapi({
      description:
        "Whether S3-compatible storage is configured, so task images and board backgrounds can be uploaded.",
    }),
    hasGithubSignIn: z.boolean(),
    hasGoogleSignIn: z.boolean(),
    hasDiscordSignIn: z.boolean(),
    hasCustomOAuth: z.boolean(),
    hasGuestAccess: z.boolean(),
    disableLoginForm: z.boolean(),
    customOAuthName: z.string().nullable().openapi({
      description:
        "Label for the custom OAuth provider on the sign-in page. Null means the generic SSO label.",
    }),
    customOAuthAutoLogin: z.boolean(),
    customOAuthLogoutUrl: z.string().nullable(),
    billingEnabled: z.boolean(),
    branding: brandingSchema,
  })
  .openapi("Config");

const instanceSmtpConfigSchema = z
  .object({
    host: z.string().nullable().openapi({
      description: "SMTP server host in effect.",
    }),
    port: z
      .number()
      .int()
      .nullable()
      .openapi({
        description:
          "SMTP server port in effect. Null lets the mail library pick the default for the security mode.",
      }),
    secure: z.boolean().openapi({
      description: "Whether the connection starts in TLS mode.",
    }),
    requireTls: z.boolean().openapi({
      description: "Whether STARTTLS is required on plaintext connections.",
    }),
    user: z.string().nullable().openapi({
      description: "SMTP authentication user in effect.",
    }),
    password: z
      .null()
      .openapi({ description: "Never returned; see passwordSet." }),
    passwordSet: z.boolean().openapi({
      description: "Whether an SMTP password is stored.",
    }),
    from: z.string().nullable().openapi({
      description: "Envelope sender address in effect.",
    }),
  })
  .openapi("InstanceSmtpConfig");

const instanceS3ConfigSchema = z
  .object({
    endpoint: z.string().nullable().openapi({
      description: "S3-compatible endpoint URL in effect.",
    }),
    region: z.string().nullable().openapi({
      description: "Bucket region in effect.",
    }),
    bucket: z.string().nullable().openapi({
      description: "Bucket name in effect.",
    }),
    accessKeyId: z.string().nullable().openapi({
      description: "Static access key id in effect.",
    }),
    secretAccessKey: z
      .null()
      .openapi({ description: "Never returned; see secretAccessKeySet." }),
    secretAccessKeySet: z.boolean().openapi({
      description: "Whether a secret access key is stored.",
    }),
    publicBaseUrl: z.string().nullable().openapi({
      description: "Public base URL objects are served from, if any.",
    }),
    keyPrefix: z.string().nullable().openapi({
      description: "Prefix prepended to object keys, if any.",
    }),
    forcePathStyle: z.boolean().openapi({
      description: "Whether path-style URLs are used.",
    }),
  })
  .openapi("InstanceS3Config");

export const instanceConfigSchema = z
  .object({
    smtp: instanceSmtpConfigSchema,
    s3: instanceS3ConfigSchema,
  })
  .openapi("InstanceConfig");
