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
import type { VerifyGiteaAccessResponse } from "@/fetchers/gitea-integration/verify-gitea-access";
import {
  useCreateGiteaIntegration,
  useVerifyGiteaAccess,
} from "@/hooks/mutations/gitea-integration/use-create-gitea-integration";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type GiteaConnectFormValues = {
  baseUrl: string;
  accessToken: string;
  repositoryOwner: string;
  repositoryName: string;
};

type GiteaVerificationState = {
  result: VerifyGiteaAccessResponse;
  verified: GiteaConnectFormValues;
};

function createSnapshot(values: GiteaConnectFormValues) {
  return {
    baseUrl: values.baseUrl.trim(),
    accessToken: values.accessToken.trim(),
    repositoryOwner: values.repositoryOwner.trim(),
    repositoryName: values.repositoryName.trim(),
  };
}

type GiteaConnectFormProps = {
  projectId: string;
  /** Opens the repository browser with the entered instance credentials. */
  onOpenBrowser: (credentials: {
    baseUrl: string;
    accessToken: string;
  }) => void;
};

/**
 * RFC 0001 WP7: the first-binding form for Gitea, shown while the project has
 * no Gitea binding yet. The verify route is called before the connect is
 * accepted, and the snapshot of verified values invalidates the moment a
 * field changes, so a connect can never run against stale credentials.
 */
export function GiteaConnectForm({
  projectId,
  onOpenBrowser,
}: GiteaConnectFormProps) {
  const { t } = useTranslation();
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateGiteaIntegration();
  const { mutateAsync: verifyAccess, isPending: isVerifying } =
    useVerifyGiteaAccess();

  const schema = useMemo(
    () =>
      z.object({
        baseUrl: z
          .string()
          .min(1, t("settings:giteaIntegration.validation.baseUrlRequired"))
          .refine((s) => {
            try {
              new URL(s);
              return true;
            } catch {
              return false;
            }
          }, t("settings:giteaIntegration.validation.baseUrlInvalid")),
        accessToken: z.string(),
        repositoryOwner: z
          .string()
          .min(1, t("settings:giteaIntegration.validation.ownerRequired"))
          .regex(
            /^[a-zA-Z0-9_.-]+$/,
            t("settings:giteaIntegration.validation.ownerInvalid"),
          ),
        repositoryName: z
          .string()
          .min(1, t("settings:giteaIntegration.validation.nameRequired"))
          .regex(
            /^[a-zA-Z0-9._-]+$/,
            t("settings:giteaIntegration.validation.nameInvalid"),
          ),
      }),
    [t],
  );

  const [verification, setVerification] =
    useState<GiteaVerificationState | null>(null);

  const form = useForm<GiteaConnectFormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      baseUrl: "",
      accessToken: "",
      repositoryOwner: "",
      repositoryName: "",
    },
  });
  const { getValues, formState } = form;
  const baseUrl = form.watch("baseUrl");
  const accessToken = form.watch("accessToken");
  const repositoryOwner = form.watch("repositoryOwner");
  const repositoryName = form.watch("repositoryName");

  const runVerify = useCallback(
    async (values: GiteaConnectFormValues, showToast: boolean) => {
      const snapshot = createSnapshot(values);
      if (!snapshot.accessToken) {
        if (showToast) {
          toast.error(t("settings:giteaIntegration.toast.tokenRequiredVerify"));
        }
        setVerification(null);
        return;
      }
      try {
        const result = await verifyAccess({
          projectId,
          baseUrl: snapshot.baseUrl,
          accessToken: snapshot.accessToken,
          repositoryOwner: snapshot.repositoryOwner,
          repositoryName: snapshot.repositoryName,
        });
        setVerification({ result, verified: snapshot });
        if (showToast) {
          if (result.isInstalled && result.hasRequiredPermissions) {
            toast.success(t("settings:giteaIntegration.toast.verifyOk"));
          } else if (result.failureReason === "redirected") {
            toast.error(t("settings:giteaIntegration.toast.redirected"));
          } else if (result.failureReason === "not_a_gitea_instance") {
            toast.error(t("settings:giteaIntegration.toast.notGiteaInstance"));
          } else if (result.failureReason === "repository_not_found") {
            toast.error(t("settings:giteaIntegration.toast.repoNotFound"));
          } else {
            toast.warning(t("settings:giteaIntegration.toast.verifyWarning"));
          }
        }
      } catch (error) {
        if (showToast) {
          toast.error(
            error instanceof Error
              ? error.message
              : t("settings:giteaIntegration.toast.verifyError"),
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
        repositoryOwner,
        repositoryName,
      });
      return Object.entries(current.verified).every(
        ([key, value]) =>
          now[key as keyof typeof now] === (value as string | undefined),
      )
        ? current
        : null;
    });
  }, [baseUrl, accessToken, repositoryOwner, repositoryName]);

  const onSubmit = async (values: GiteaConnectFormValues) => {
    const snapshot = createSnapshot(values);
    if (!snapshot.accessToken) {
      toast.error(t("settings:giteaIntegration.toast.tokenRequired"));
      return;
    }
    try {
      if (
        !verification ||
        !verification.result.isInstalled ||
        !verification.result.hasRequiredPermissions
      ) {
        toast.error(t("settings:giteaIntegration.toast.verifyFirst"));
        return;
      }
      await createIntegration({
        projectId,
        data: {
          baseUrl: snapshot.baseUrl,
          accessToken: snapshot.accessToken,
          repositoryOwner: snapshot.repositoryOwner,
          repositoryName: snapshot.repositoryName,
        },
      });
      toast.success(t("settings:giteaIntegration.toast.updated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:giteaIntegration.toast.updateError"),
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
                      {t("settings:giteaIntegration.baseUrlLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:giteaIntegration.baseUrlHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Input
                      className="w-72"
                      placeholder="https://gitea.example.com"
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
                      {t("settings:giteaIntegration.tokenLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:giteaIntegration.tokenHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Input
                      className="w-72"
                      type="password"
                      autoComplete="off"
                      placeholder={t(
                        "settings:giteaIntegration.tokenPlaceholder",
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
            name="repositoryOwner"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:giteaIntegration.ownerLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:giteaIntegration.ownerHint")}
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

          <FormField
            control={form.control}
            name="repositoryName"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:giteaIntegration.repoNameLabel")}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:giteaIntegration.repoNameHint")}
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
                {t("settings:giteaIntegration.actionsTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings:giteaIntegration.actionsHint")}
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
                  })
                }
              >
                <GitBranch className="size-3" />
                {t("settings:giteaIntegration.browse")}
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
                {t("settings:giteaIntegration.verify")}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="gap-2"
                disabled={isCreating || !formState.isValid || !verified}
              >
                <Link className="size-3" />
                {t("settings:giteaIntegration.connect")}
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
