import { z } from "../openapi";
import { MANAGED_PROFILE_FIELDS } from "../utils/custom-oauth-env";

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
      description: "Whether the Kaneo attribution appears on public pages.",
    }),
  })
  .openapi("Branding");

export const configSchema = z
  .object({
    isCloud: z.boolean(),
    instanceName: z.string().openapi({
      description: "Name shown in page titles and emails. Defaults to Kaneo.",
    }),
    disableRegistration: z.boolean(),
    disablePasswordRegistration: z.boolean(),
    disableEmailOtpSignIn: z.boolean(),
    disableWorkspaceCreation: z.boolean(),
    disabledIntegrations: z.array(z.string()).openapi({
      description:
        "Integration provider types an administrator turned off, such as `slack`.",
    }),
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
    customOAuthManagedProfileFields: z
      .array(z.enum(MANAGED_PROFILE_FIELDS))
      .openapi({
        description:
          "Profile fields the custom OAuth/OIDC provider manages for people with a linked provider account.",
      }),
    customOAuthAccountUrl: z.string().nullable().openapi({
      description:
        "Account page of the custom OAuth/OIDC provider, where people change managed profile fields. Null when not configured.",
    }),
    billingEnabled: z.boolean(),
    branding: brandingSchema,
  })
  .openapi("Config");
