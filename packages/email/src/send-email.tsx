import { render } from "@react-email/components";
import { config } from "dotenv-mono";
import * as nodemailer from "nodemailer";
import { instanceHost } from "./components/instance-host";
import { getSmtpTransportOptions, isSmtpConfigured } from "./smtp-config";
import { getSmtpErrorDetails } from "./smtp-error-details";
import type { MagicLinkEmailProps } from "./templates/magic-link";
import MagicLinkEmail from "./templates/magic-link";
import NotificationEmail, {
  type NotificationEmailProps,
} from "./templates/notification";
import type { OtpEmailProps } from "./templates/otp";
import OtpEmail from "./templates/otp";
import PasswordResetEmail, {
  type PasswordResetEmailProps,
} from "./templates/password-reset";
import TrialReminderEmail, {
  type TrialReminderEmailProps,
} from "./templates/trial-reminder";
import WorkspaceInvitationEmail, {
  type WorkspaceInvitationEmailProps,
} from "./templates/workspace-invitation";

config();

type SmtpTransporter = ReturnType<typeof nodemailer.createTransport>;
let transporter: { key: string; value: SmtpTransporter } | undefined;

// Rebuilt when the settings change (the instance config editor can update SMTP at runtime),
// cached otherwise so every send reuses one connection pool.
function getTransporter() {
  const options = getSmtpTransportOptions();
  const key = JSON.stringify(options);
  if (!transporter || transporter.key !== key) {
    transporter = { key, value: nodemailer.createTransport(options) };
  }
  return transporter.value;
}

export const sendMagicLinkEmail = async (
  to: string,
  subject: string,
  data: MagicLinkEmailProps,
) => {
  const emailTemplate = await render(
    MagicLinkEmail({ email: to, instance: instanceHost(), ...data }),
  );
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html: emailTemplate,
    });
  } catch (error) {
    console.error("Error sending magic link email", error);
  }
};

export const sendOtpEmail = async (
  to: string,
  subject: string,
  data: OtpEmailProps,
) => {
  const emailTemplate = await render(
    OtpEmail({ email: to, instance: instanceHost(), ...data }),
  );
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html: emailTemplate,
    });
  } catch (error) {
    console.error("Error sending OTP email", error);
  }
};

export const sendPasswordResetEmail = async (
  to: string,
  subject: string,
  data: PasswordResetEmailProps,
) => {
  let emailTemplate: string;
  try {
    emailTemplate = await render(
      PasswordResetEmail({ email: to, instance: instanceHost(), ...data }),
    );
  } catch {
    console.error("Error rendering password reset email");
    return;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html: emailTemplate,
    });
  } catch (error) {
    console.error(
      "Error sending password reset email",
      getSmtpErrorDetails(error),
    );
  }
};

export type EmailResult = {
  success: boolean;
  reason?: "SMTP_NOT_CONFIGURED";
};

export const sendWorkspaceInvitationEmail = async (
  to: string,
  subject: string,
  data: WorkspaceInvitationEmailProps,
): Promise<EmailResult> => {
  if (!isSmtpConfigured()) {
    return { success: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const emailTemplate = await render(
      WorkspaceInvitationEmail({ instance: instanceHost(), ...data, to }),
    );
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html: emailTemplate,
    });
    return { success: true };
  } catch (error) {
    console.error("Error sending workspace invitation email", error);
    throw error;
  }
};

export const sendNotificationEmail = async (
  to: string,
  subject: string,
  data: NotificationEmailProps,
): Promise<EmailResult> => {
  if (!isSmtpConfigured()) {
    return { success: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const emailTemplate = await render(NotificationEmail(data));
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html: emailTemplate,
    });
    return { success: true };
  } catch (error) {
    console.error("Error sending notification email", error);
    throw error;
  }
};

export const sendTrialReminderEmail = async (
  to: string,
  subject: string,
  data: TrialReminderEmailProps,
) => {
  const emailTemplate = await render(
    TrialReminderEmail({ email: to, ...data }),
  );
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html: emailTemplate,
    });
  } catch (error) {
    console.error("Error sending trial reminder email", error);
  }
};
