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
