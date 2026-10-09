import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  AlertTriangle,
  CheckCircle,
  Link,
  RefreshCw,
  SquareKanban,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { VerifyJiraAccessResponse } from "@/fetchers/jira-integration/verify-jira-access";
import {
  useCreateJiraIntegration,
  useVerifyJiraAccess,
} from "@/hooks/mutations/jira-integration/use-create-jira-integration";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type JiraAuthMode = "cloud" | "dc";

type JiraConnectFormValues = {
  baseUrl: string;
  authMode: JiraAuthMode;
  email: string;
  apiToken: string;
  projectKey: string;
};

type JiraVerificationState = {
  result: VerifyJiraAccessResponse;
  verified: JiraConnectFormValues;
};

/** Credentials the browser pass needs; the project is picked in the modal. */
export type JiraConnectCredentials = {
  baseUrl: string;
  authMode: JiraAuthMode;
  email: string;
  apiToken: string;
};

function createSnapshot(values: JiraConnectFormValues) {
  return {
    baseUrl: values.baseUrl.trim(),
    authMode: values.authMode,
    email: values.email.trim(),
    apiToken: values.apiToken.trim(),
    projectKey: values.projectKey.trim(),
  };
}

type JiraConnectFormProps = {
  projectId: string;
  /** Opens the project browser with the entered instance credentials. */
  onOpenBrowser: (credentials: JiraConnectCredentials) => void;
};

/**
 * RFC 0001 WP7: the first-binding form for Jira, shown while the project has
 * no Jira binding yet. The verify route is called before the connect is
 * accepted, and the snapshot of verified values invalidates the moment a
 * field changes, so a connect can never run against stale credentials.
 * Cloud instances authenticate with the account email and an API token;
 * Data Center instances authenticate with a personal access token.
 */
export function JiraConnectForm({
  projectId,
  onOpenBrowser,
}: JiraConnectFormProps) {
  const { t } = useTranslation();
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateJiraIntegration();
  const { mutateAsync: verifyAccess, isPending: isVerifying } =
    useVerifyJiraAccess();

  const schema = useMemo(
    () =>
      z
        .object({
          baseUrl: z
            .string()
            .min(1, t("settings:jiraIntegration.validation.baseUrlRequired"))
            .refine((s) => {
              try {
                new URL(s);
                return true;
              } catch {
                return false;
              }
            }, t("settings:jiraIntegration.validation.baseUrlInvalid")),
          authMode: z.enum(["cloud", "dc"]),
          email: z.string(),
          apiToken: z.string(),
          projectKey: z
            .string()
            .min(1, t("settings:jiraIntegration.validation.projectKeyRequired"))
            .regex(
              /^[A-Za-z][A-Za-z0-9_]*$/,
              t("settings:jiraIntegration.validation.projectKeyInvalid"),
            ),
        })
        .superRefine((values, ctx) => {
          if (values.authMode === "cloud" && !values.email.trim()) {
            ctx.addIssue({
              code: "custom",
              path: ["email"],
              message: t("settings:jiraIntegration.validation.emailRequired"),
            });
          }
        }),
    [t],
  );

  const [verification, setVerification] =
    useState<JiraVerificationState | null>(null);

  const form = useForm<JiraConnectFormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      baseUrl: "",
      authMode: "cloud",
      email: "",
      apiToken: "",
      projectKey: "",
    },
  });
  const { getValues, formState } = form;
  const baseUrl = form.watch("baseUrl");
  const authMode = form.watch("authMode");
  const email = form.watch("email");
  const apiToken = form.watch("apiToken");
  const projectKey = form.watch("projectKey");

  const runVerify = useCallback(
    async (values: JiraConnectFormValues, showToast: boolean) => {
      const snapshot = createSnapshot(values);
      if (!snapshot.apiToken) {
        if (showToast) {
          toast.error(t("settings:jiraIntegration.toast.tokenRequiredVerify"));
        }
        setVerification(null);
        return;
      }
      if (snapshot.authMode === "cloud" && !snapshot.email) {
        if (showToast) {
          toast.error(t("settings:jiraIntegration.toast.emailRequiredVerify"));
        }
        setVerification(null);
        return;
      }
      try {
        const result = await verifyAccess({
          projectId,
          baseUrl: snapshot.baseUrl,
          authMode: snapshot.authMode,
          email: snapshot.authMode === "cloud" ? snapshot.email : undefined,
          apiToken: snapshot.apiToken,
          projectKey: snapshot.projectKey,
        });
        setVerification({ result, verified: snapshot });
        if (showToast) {
          if (result.isInstalled && result.hasRequiredPermissions) {
            toast.success(t("settings:jiraIntegration.toast.verifyOk"));
          } else if (result.failureReason === "redirected") {
            toast.error(t("settings:jiraIntegration.toast.redirected"));
          } else if (result.failureReason === "not_a_jira_instance") {
            toast.error(t("settings:jiraIntegration.toast.notJiraInstance"));
          } else if (result.failureReason === "project_not_found") {
            toast.error(t("settings:jiraIntegration.toast.projectNotFound"));
          } else {
            toast.warning(t("settings:jiraIntegration.toast.verifyWarning"));
          }
        }
      } catch (error) {
        if (showToast) {
          toast.error(
            error instanceof Error
              ? error.message
              : t("settings:jiraIntegration.toast.verifyError"),
          );
        }
        setVerification(null);
      }
    },
    [verifyAccess, projectId, t],
  );

  // A verified snapshot is invalidated the moment any field changes, so the
  // connect can never run against values the user edited after verifying.
  useEffect(() => {
    setVerification((current) => {
      if (!current) return current;
      const now = createSnapshot({
        baseUrl,
        authMode,
        email,
        apiToken,
        projectKey,
      });
      return Object.entries(current.verified).every(
        ([key, value]) =>
          now[key as keyof typeof now] === (value as string | undefined),
      )
        ? current
        : null;
    });
  }, [baseUrl, authMode, email, apiToken, projectKey]);

  const onSubmit = async (values: JiraConnectFormValues) => {
    const snapshot = createSnapshot(values);
    if (!snapshot.apiToken) {
      toast.error(t("settings:jiraIntegration.toast.tokenRequired"));
      return;
    }
    try {
      if (
        !verification ||
        !verification.result.isInstalled ||
        !verification.result.hasRequiredPermissions
      ) {
        toast.error(t("settings:jiraIntegration.toast.verifyFirst"));
        return;
      }
      await createIntegration({
        projectId,
        data: {
          baseUrl: snapshot.baseUrl,
          authMode: snapshot.authMode,
          email: snapshot.authMode === "cloud" ? snapshot.email : undefined,
          apiToken: snapshot.apiToken,
          projectKey: snapshot.projectKey,
        },
      });
      toast.success(t("settings:jiraIntegration.toast.updated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:jiraIntegration.toast.updateError"),
      );
    }
  };

  const verified =
    verification?.result.isInstalled &&
    verification.result.hasRequiredPermissions;

  // From the watched values, not getValues(), so the browse button reacts to
  // every keystroke the same way the other action buttons do.
  const credentialsComplete =
    baseUrl.trim().length > 0 &&
    apiToken.trim().length > 0 &&
    (authMode !== "cloud" || email.trim().length > 0);

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="baseUrl"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:jiraIntegration.baseUrlLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:jiraIntegration.baseUrlHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Input
                      className="w-72"
                      placeholder="https://your-company.atlassian.net"
                      {...field}
                      disabled={isCreating}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          <FormField
            control={form.control}
            name="authMode"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:jiraIntegration.authModeLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:jiraIntegration.authModeHint")}
                    </p>
                  </div>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isCreating}
                  >
                    <FormControl>
                      <SelectTrigger className="w-72">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cloud">
                        {t("settings:jiraIntegration.authModeCloud")}
                      </SelectItem>
                      <SelectItem value="dc">
                        {t("settings:jiraIntegration.authModeDc")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          {authMode === "cloud" ? (
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        {t("settings:jiraIntegration.emailLabel")}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("settings:jiraIntegration.emailHint")}
                      </p>
                    </div>
                    <FormControl>
                      <Input
                        className="w-72"
                        type="email"
                        autoComplete="off"
                        placeholder="you@example.com"
                        {...field}
                        disabled={isCreating}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <FormField
            control={form.control}
            name="apiToken"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t(
                        authMode === "cloud"
                          ? "settings:jiraIntegration.tokenLabel"
                          : "settings:jiraIntegration.patLabel",
                      )}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        authMode === "cloud"
                          ? "settings:jiraIntegration.tokenHint"
                          : "settings:jiraIntegration.patHint",
                      )}
                    </p>
                  </div>
                  <FormControl>
                    <Input
                      className="w-72"
                      type="password"
                      autoComplete="off"
                      placeholder={t(
                        "settings:jiraIntegration.tokenPlaceholder",
                      )}
                      {...field}
                      disabled={isCreating}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          <FormField
            control={form.control}
            name="projectKey"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:jiraIntegration.projectKeyLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:jiraIntegration.projectKeyHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Input className="w-64" {...field} disabled={isCreating} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {t("settings:jiraIntegration.actionsTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings:jiraIntegration.actionsHint")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isCreating || !credentialsComplete}
                onClick={() =>
                  onOpenBrowser({
                    baseUrl: baseUrl.trim(),
                    authMode,
                    email: email.trim(),
                    apiToken: apiToken.trim(),
                  })
                }
              >
                <SquareKanban className="size-3" />
                {t("settings:jiraIntegration.browse")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={
                  isVerifying ||
                  !formState.isValid ||
                  !apiToken.trim() ||
                  !baseUrl.trim() ||
                  (authMode === "cloud" && !email.trim())
                }
                onClick={() => void runVerify(getValues(), true)}
              >
                <RefreshCw
                  className={cn("size-3", isVerifying && "animate-spin")}
                />
                {t("settings:jiraIntegration.verify")}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="gap-2"
                disabled={isCreating || !formState.isValid || !verified}
              >
                <Link className="size-3" />
                {t("settings:jiraIntegration.connect")}
              </Button>
            </div>
          </div>
        </form>
      </Form>

      {verification ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-md border p-3 text-sm",
            verified
              ? "border-success/25 bg-success/10"
              : verification.result.failureReason
                ? "border-destructive/25 bg-destructive/10"
                : "border-warning/25 bg-warning/10",
          )}
        >
          {verified ? (
            <CheckCircle className="mt-0.5 size-4 shrink-0 text-success-foreground" />
          ) : verification.result.failureReason ? (
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          )}
          <p className="flex-1 font-medium">{verification.result.message}</p>
        </div>
      ) : null}
    </div>
  );
}
