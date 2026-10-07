import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  AlertTriangle,
  CheckCircle,
  GitBranch,
  Link,
  RefreshCw,
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
import type { VerifyGitlabAccessResponse } from "@/fetchers/gitlab-integration/verify-gitlab-access";
import {
  useCreateGitlabIntegration,
  useVerifyGitlabAccess,
} from "@/hooks/mutations/gitlab-integration/use-create-gitlab-integration";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

const GITLAB_CLOUD_URL = "https://gitlab.com";

type GitlabConnectFormValues = {
  baseUrl: string;
  accessToken: string;
  tokenType: "private" | "bearer";
  projectPath: string;
};

type GitlabVerificationState = {
  result: VerifyGitlabAccessResponse;
  verified: GitlabConnectFormValues;
};

function createSnapshot(values: GitlabConnectFormValues) {
  return {
    baseUrl: values.baseUrl.trim(),
    accessToken: values.accessToken.trim(),
    tokenType: values.tokenType,
    projectPath: values.projectPath.trim().replace(/^\/+|\/+$/g, ""),
  };
}

type GitlabConnectFormProps = {
  projectId: string;
  /** Opens the project browser with the entered instance credentials. */
  onOpenBrowser: (credentials: {
    baseUrl: string;
    accessToken: string;
    tokenType: "private" | "bearer";
  }) => void;
};

/**
 * RFC 0001 WP7: the first-binding form for GitLab, shown while the project
 * has no GitLab binding yet. The verify route is called before the connect is
 * accepted, and the snapshot of verified values invalidates the moment a
 * field changes, so a connect can never run against stale credentials.
 */
export function GitlabConnectForm({
  projectId,
  onOpenBrowser,
}: GitlabConnectFormProps) {
  const { t } = useTranslation();
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateGitlabIntegration();
  const { mutateAsync: verifyAccess, isPending: isVerifying } =
    useVerifyGitlabAccess();

  const schema = useMemo(
    () =>
      z.object({
        baseUrl: z
          .string()
          .min(1, t("settings:gitlabIntegration.validation.baseUrlRequired"))
          .refine((s) => {
            try {
              new URL(s);
              return true;
            } catch {
              return false;
            }
          }, t("settings:gitlabIntegration.validation.baseUrlInvalid")),
        accessToken: z.string(),
        tokenType: z.enum(["private", "bearer"]),
        projectPath: z
          .string()
          .min(1, t("settings:gitlabIntegration.validation.pathRequired"))
          .refine(
            (s) => /^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)+$/.test(s.trim()),
            t("settings:gitlabIntegration.validation.pathInvalid"),
          ),
      }),
    [t],
  );

  const [verification, setVerification] =
    useState<GitlabVerificationState | null>(null);

  const form = useForm<GitlabConnectFormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      baseUrl: GITLAB_CLOUD_URL,
      accessToken: "",
      tokenType: "private",
      projectPath: "",
    },
  });
  const { getValues, formState } = form;
  const baseUrl = form.watch("baseUrl");
  const accessToken = form.watch("accessToken");
  const tokenType = form.watch("tokenType");
  const projectPath = form.watch("projectPath");

  const runVerify = useCallback(
    async (values: GitlabConnectFormValues, showToast: boolean) => {
      const snapshot = createSnapshot(values);
      if (!snapshot.accessToken) {
        if (showToast) {
          toast.error(
            t("settings:gitlabIntegration.toast.tokenRequiredVerify"),
          );
        }
        setVerification(null);
        return;
      }
      try {
        const result = await verifyAccess({
          projectId,
          baseUrl: snapshot.baseUrl,
          accessToken: snapshot.accessToken,
          tokenType: snapshot.tokenType,
          projectPath: snapshot.projectPath,
        });
        setVerification({ result, verified: snapshot });
        if (showToast) {
          if (result.isInstalled && result.hasRequiredPermissions) {
            toast.success(t("settings:gitlabIntegration.toast.verifyOk"));
          } else if (result.failureReason === "redirected") {
            toast.error(t("settings:gitlabIntegration.toast.redirected"));
          } else if (result.failureReason === "not_a_gitlab_instance") {
            toast.error(
              t("settings:gitlabIntegration.toast.notGitlabInstance"),
            );
          } else if (result.failureReason === "project_not_found") {
            toast.error(t("settings:gitlabIntegration.toast.projectNotFound"));
          } else {
            toast.warning(t("settings:gitlabIntegration.toast.verifyWarning"));
          }
        }
      } catch (error) {
        if (showToast) {
          toast.error(
            error instanceof Error
              ? error.message
              : t("settings:gitlabIntegration.toast.verifyError"),
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
        accessToken,
        tokenType,
        projectPath,
      });
      return Object.entries(current.verified).every(
        ([key, value]) =>
          now[key as keyof typeof now] === (value as string | undefined),
      )
        ? current
        : null;
    });
  }, [baseUrl, accessToken, tokenType, projectPath]);

  const onSubmit = async (values: GitlabConnectFormValues) => {
    const snapshot = createSnapshot(values);
    if (!snapshot.accessToken) {
      toast.error(t("settings:gitlabIntegration.toast.tokenRequired"));
      return;
    }
    try {
      if (
        !verification ||
        !verification.result.isInstalled ||
        !verification.result.hasRequiredPermissions
      ) {
        toast.error(t("settings:gitlabIntegration.toast.verifyFirst"));
        return;
      }
      await createIntegration({
        projectId,
        data: {
          baseUrl: snapshot.baseUrl,
          accessToken: snapshot.accessToken,
          tokenType: snapshot.tokenType,
          projectPath: snapshot.projectPath,
        },
      });
      toast.success(t("settings:gitlabIntegration.toast.updated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:gitlabIntegration.toast.updateError"),
      );
    }
  };

  const verified =
    verification?.result.isInstalled &&
    verification.result.hasRequiredPermissions;

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
                      {t("settings:gitlabIntegration.baseUrlLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:gitlabIntegration.baseUrlHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Input
                      className="w-72"
                      placeholder={GITLAB_CLOUD_URL}
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
            name="accessToken"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:gitlabIntegration.tokenLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:gitlabIntegration.tokenHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Input
                      className="w-72"
                      type="password"
                      autoComplete="off"
                      placeholder={t(
                        "settings:gitlabIntegration.tokenPlaceholder",
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
            name="tokenType"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:gitlabIntegration.tokenTypeLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:gitlabIntegration.tokenTypeHint")}
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
                      <SelectItem value="private">
                        {t("settings:gitlabIntegration.tokenTypePrivate")}
                      </SelectItem>
                      <SelectItem value="bearer">
                        {t("settings:gitlabIntegration.tokenTypeBearer")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          <FormField
            control={form.control}
            name="projectPath"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:gitlabIntegration.projectPathLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:gitlabIntegration.projectPathHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Input
                      className="w-72"
                      placeholder="group/project"
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

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {t("settings:gitlabIntegration.actionsTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings:gitlabIntegration.actionsHint")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!baseUrl.trim() || !accessToken.trim()}
                onClick={() =>
                  onOpenBrowser({
                    baseUrl: baseUrl.trim(),
                    accessToken: accessToken.trim(),
                    tokenType,
                  })
                }
              >
                <GitBranch className="size-3" />
                {t("settings:gitlabIntegration.browse")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={
                  isVerifying ||
                  !formState.isValid ||
                  !accessToken.trim() ||
                  !baseUrl.trim()
                }
                onClick={() => void runVerify(getValues(), true)}
              >
                <RefreshCw
                  className={cn("size-3", isVerifying && "animate-spin")}
                />
                {t("settings:gitlabIntegration.verify")}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="gap-2"
                disabled={isCreating || !formState.isValid || !verified}
              >
                <Link className="size-3" />
                {t("settings:gitlabIntegration.connect")}
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
