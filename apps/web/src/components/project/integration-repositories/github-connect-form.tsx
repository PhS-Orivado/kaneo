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
import { Separator } from "@/components/ui/separator";
import type { VerifyGithubInstallationResponse } from "@/fetchers/github-integration/verify-github-installation";
import {
  useCreateGithubIntegration,
  useVerifyGithubInstallation,
} from "@/hooks/mutations/github-integration/use-create-github-integration";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type GithubConnectFormValues = {
  repositoryOwner: string;
  repositoryName: string;
};

type GithubVerificationState = {
  result: VerifyGithubInstallationResponse;
  verified: GithubConnectFormValues;
};

function createSnapshot(values: GithubConnectFormValues) {
  return {
    repositoryOwner: values.repositoryOwner.trim(),
    repositoryName: values.repositoryName.trim(),
  };
}

type GithubConnectFormProps = {
  projectId: string;
  /** Opens the repository browser of the connected GitHub account. */
  onOpenBrowser: () => void;
};

/**
 * RFC 0001 WP7: the first-binding form for GitHub, shown while the project
 * has no GitHub binding yet. The installation check runs before the connect
 * is accepted, and the snapshot of verified values invalidates the moment a
 * field changes, so a connect can never run against stale credentials.
 */
export function GithubConnectForm({
  projectId,
  onOpenBrowser,
}: GithubConnectFormProps) {
  const { t } = useTranslation();
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateGithubIntegration();
  const { mutateAsync: verifyInstallation, isPending: isVerifying } =
    useVerifyGithubInstallation();

  const schema = useMemo(
    () =>
      z.object({
        repositoryOwner: z
          .string()
          .min(1, t("settings:githubIntegration.validation.ownerRequired"))
          .regex(
            /^[a-zA-Z0-9-]+$/,
            t("settings:githubIntegration.validation.ownerInvalid"),
          ),
        repositoryName: z
          .string()
          .min(1, t("settings:githubIntegration.validation.nameRequired"))
          .regex(
            /^[a-zA-Z0-9._-]+$/,
            t("settings:githubIntegration.validation.nameInvalid"),
          ),
      }),
    [t],
  );

  const [verification, setVerification] =
    useState<GithubVerificationState | null>(null);

  const form = useForm<GithubConnectFormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      repositoryOwner: "",
      repositoryName: "",
    },
  });
  const { getValues, formState } = form;
  const repositoryOwner = form.watch("repositoryOwner");
  const repositoryName = form.watch("repositoryName");

  const runVerify = useCallback(
    async (values: GithubConnectFormValues, showToast: boolean) => {
      const snapshot = createSnapshot(values);
      try {
        const result = await verifyInstallation({
          ...snapshot,
          projectId,
        });
        setVerification({ result, verified: snapshot });
        if (showToast) {
          if (result.isInstalled && result.hasRequiredPermissions) {
            toast.success(t("settings:githubIntegration.toast.installedOk"));
          } else if (result.isInstalled) {
            toast.warning(
              t("settings:githubIntegration.toast.installedMissingPerms"),
            );
          } else if (result.repositoryExists) {
            toast.warning(
              t("settings:githubIntegration.toast.needsInstallOnRepo"),
            );
          } else {
            toast.error(t("settings:githubIntegration.toast.repoNotFound"));
          }
        }
      } catch (error) {
        if (showToast) {
          toast.error(
            error instanceof Error
              ? error.message
              : t("settings:githubIntegration.toast.verifyError"),
          );
        }
        setVerification(null);
      }
    },
    [verifyInstallation, projectId, t],
  );

  // A verified snapshot is invalidated the moment any field changes, so the
  // connect can never run against values the user edited after verifying.
  useEffect(() => {
    setVerification((current) => {
      if (!current) return current;
      const now = createSnapshot({ repositoryOwner, repositoryName });
      return current.verified.repositoryOwner === now.repositoryOwner &&
        current.verified.repositoryName === now.repositoryName
        ? current
        : null;
    });
  }, [repositoryOwner, repositoryName]);

  const onSubmit = async (values: GithubConnectFormValues) => {
    const snapshot = createSnapshot(values);
    try {
      if (
        !verification ||
        !verification.result.isInstalled ||
        !verification.result.hasRequiredPermissions
      ) {
        const result = await verifyInstallation({ ...snapshot, projectId });
        if (!result.isInstalled) {
          toast.error(t("settings:githubIntegration.toast.installAppFirst"));
          return;
        }
        if (!result.hasRequiredPermissions) {
          toast.error(
            t("settings:githubIntegration.toast.missingPermsDetail", {
              list: result.missingPermissions?.join(", ") || "issues",
            }),
          );
          return;
        }
        setVerification({ result, verified: snapshot });
      }
      await createIntegration({
        projectId,
        data: snapshot,
      });
      toast.success(t("settings:githubIntegration.toast.updated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:githubIntegration.toast.updateError"),
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
            name="repositoryOwner"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:githubIntegration.ownerLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:githubIntegration.ownerHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Input
                      className="w-72"
                      placeholder={t(
                        "settings:githubIntegration.ownerPlaceholder",
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
            name="repositoryName"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:githubIntegration.repoNameLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:githubIntegration.repoNameHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Input
                      className="w-72"
                      placeholder={t(
                        "settings:githubIntegration.repoNamePlaceholder",
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

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {t("settings:githubIntegration.actionsTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings:githubIntegration.actionsHint")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onOpenBrowser}
              >
                <GitBranch className="size-3" />
                {t("settings:githubIntegration.browse")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isVerifying || !formState.isValid}
                onClick={() => void runVerify(getValues(), true)}
              >
                <RefreshCw
                  className={cn("size-3", isVerifying && "animate-spin")}
                />
                {t("settings:githubIntegration.verify")}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="gap-2"
                disabled={isCreating || !formState.isValid || !verified}
              >
                <Link className="size-3" />
                {t("settings:githubIntegration.connect")}
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
              : verification.result.isInstalled ||
                  verification.result.repositoryExists
                ? "border-warning/25 bg-warning/10"
                : "border-destructive/25 bg-destructive/10",
          )}
        >
          {verified ? (
            <CheckCircle className="mt-0.5 size-4 shrink-0 text-success-foreground" />
          ) : verification.result.isInstalled ||
              verification.result.repositoryExists ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />
          )}
          <div className="flex-1">
            <p className="font-medium">{verification.result.message}</p>
            {verification.result.isInstalled &&
              !verification.result.hasRequiredPermissions &&
              verification.result.missingPermissions && (
                <p className="mt-1 text-xs">
                  {t("settings:githubIntegration.missingPermissionsLabel")}{" "}
                  <strong>
                    {verification.result.missingPermissions.join(", ")}
                  </strong>
                </p>
              )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
