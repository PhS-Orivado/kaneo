import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { CheckCircle, Trash2 } from "lucide-react";
import React from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  useCreateMatrixIntegration,
  useDeleteMatrixIntegration,
  useUpdateMatrixIntegration,
} from "@/hooks/mutations/matrix-integration/use-matrix-integration";
import useGetMatrixIntegration from "@/hooks/queries/matrix-integration/use-get-matrix-integration";
import { toast } from "@/lib/toast";

type MatrixIntegrationFormValues = {
  homeserverUrl: string;
  userId: string;
  accessToken: string;
  spaceNamePrefix: string;
  inviteUsers: string;
  taskCreated: boolean;
  taskStatusChanged: boolean;
  taskPriorityChanged: boolean;
  taskTitleChanged: boolean;
  taskDescriptionChanged: boolean;
  taskCommentCreated: boolean;
};

function EventToggle({
  control,
  name,
  label,
}: {
  control: ReturnType<typeof useForm<MatrixIntegrationFormValues>>["control"];
  name: keyof Pick<
    MatrixIntegrationFormValues,
    | "taskCreated"
    | "taskStatusChanged"
    | "taskPriorityChanged"
    | "taskTitleChanged"
    | "taskDescriptionChanged"
    | "taskCommentCreated"
  >;
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
          <FormLabel className="text-sm font-medium">{label}</FormLabel>
          <FormControl>
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

function isValidHomeserverUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/.test(value);
}

function isValidMatrixUserId(value: string): boolean {
  return /^@[^:\s]+:\S+$/.test(value);
}

export function MatrixIntegrationSettings({
  projectId,
}: {
  projectId: string;
}) {
  const { t } = useTranslation();
  const schema = React.useMemo(
    () =>
      z.object({
        homeserverUrl: z.string(),
        userId: z.string(),
        accessToken: z.string(),
        spaceNamePrefix: z.string(),
        inviteUsers: z.string(),
        taskCreated: z.boolean(),
        taskStatusChanged: z.boolean(),
        taskPriorityChanged: z.boolean(),
        taskTitleChanged: z.boolean(),
        taskDescriptionChanged: z.boolean(),
        taskCommentCreated: z.boolean(),
      }),
    [],
  );

  const {
    data: integration,
    isLoading,
    error,
  } = useGetMatrixIntegration(projectId);
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateMatrixIntegration();
  const { mutateAsync: updateIntegration, isPending: isUpdating } =
    useUpdateMatrixIntegration();
  const { mutateAsync: deleteIntegration, isPending: isDeleting } =
    useDeleteMatrixIntegration();
  const normalizedValues = React.useMemo<MatrixIntegrationFormValues>(
    () => ({
      homeserverUrl: integration?.homeserverUrl ?? "",
      userId: integration?.userId ?? "",
      accessToken: "",
      spaceNamePrefix: integration?.spaceNamePrefix ?? "",
      inviteUsers: integration?.inviteUsers?.join(", ") ?? "",
      taskCreated: integration?.events?.taskCreated ?? true,
      taskStatusChanged: integration?.events?.taskStatusChanged ?? true,
      taskPriorityChanged: integration?.events?.taskPriorityChanged ?? false,
      taskTitleChanged: integration?.events?.taskTitleChanged ?? false,
      taskDescriptionChanged:
        integration?.events?.taskDescriptionChanged ?? false,
      taskCommentCreated: integration?.events?.taskCommentCreated ?? true,
    }),
    [integration],
  );

  const form = useForm<MatrixIntegrationFormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      homeserverUrl: "",
      userId: "",
      accessToken: "",
      spaceNamePrefix: "",
      inviteUsers: "",
      taskCreated: true,
      taskStatusChanged: true,
      taskPriorityChanged: false,
      taskTitleChanged: false,
      taskDescriptionChanged: false,
      taskCommentCreated: true,
    },
  });
  const { reset } = form;
  const lastResetKeyRef = React.useRef<string | null>(null);
  const resetKey = `${projectId}:${integration?.id ?? "none"}`;

  React.useEffect(() => {
    if (form.formState.isDirty && lastResetKeyRef.current === resetKey) {
      return;
    }

    reset(normalizedValues);
    lastResetKeyRef.current = resetKey;
  }, [form.formState.isDirty, normalizedValues, reset, resetKey]);

  React.useEffect(() => {
    if (!error) {
      return;
    }

    const detail =
      error instanceof Error
        ? error.message
        : t("settings:matrixIntegration.toast.saveError");
    toast.error(
      `${t("settings:matrixIntegration.toast.saveError")}: ${detail}`,
    );
  }, [error, t]);

  const isConnected = Boolean(integration?.tokenConfigured);
  const isBusy = isCreating || isUpdating || isDeleting;

  const onSubmit = async (values: MatrixIntegrationFormValues) => {
    try {
      const trimmedHomeserverUrl = values.homeserverUrl.trim();
      const trimmedUserId = values.userId.trim();
      const trimmedAccessToken = values.accessToken.trim();
      const trimmedSpaceNamePrefix = values.spaceNamePrefix.trim();
      const trimmedInviteUsers = values.inviteUsers.trim();
      const inviteUsers = trimmedInviteUsers
        ? trimmedInviteUsers
            .split(",")
            .map((user) => user.trim())
            .filter(Boolean)
        : [];
      const events = {
        taskCreated: values.taskCreated,
        taskStatusChanged: values.taskStatusChanged,
        taskPriorityChanged: values.taskPriorityChanged,
        taskTitleChanged: values.taskTitleChanged,
        taskDescriptionChanged: values.taskDescriptionChanged,
        taskCommentCreated: values.taskCommentCreated,
      };

      if (!isValidHomeserverUrl(trimmedHomeserverUrl)) {
        form.setError("homeserverUrl", {
          message: t("settings:matrixIntegration.validation.homeserverInvalid"),
        });
        return;
      }

      if (!isValidMatrixUserId(trimmedUserId)) {
        form.setError("userId", {
          message: t("settings:matrixIntegration.validation.userIdInvalid"),
        });
        return;
      }

      if (!isConnected && !trimmedAccessToken) {
        form.setError("accessToken", {
          message: t(
            "settings:matrixIntegration.validation.connectionInvalid",
          ),
        });
        return;
      }

      if (!isConnected) {
        await createIntegration({
          projectId,
          data: {
            homeserverUrl: trimmedHomeserverUrl,
            userId: trimmedUserId,
            accessToken: trimmedAccessToken,
            spaceNamePrefix: trimmedSpaceNamePrefix || undefined,
            inviteUsers: inviteUsers.length > 0 ? inviteUsers : undefined,
            events,
          },
        });
      } else {
        await updateIntegration({
          projectId,
          json: {
            homeserverUrl: trimmedHomeserverUrl,
            userId: trimmedUserId,
            accessToken: trimmedAccessToken || undefined,
            spaceNamePrefix: trimmedSpaceNamePrefix || null,
            inviteUsers,
            events,
          },
        });
      }

      form.reset({
        ...values,
        homeserverUrl: trimmedHomeserverUrl,
        userId: trimmedUserId,
        accessToken: "",
        spaceNamePrefix: trimmedSpaceNamePrefix,
        inviteUsers: inviteUsers.join(", "),
      });
      toast.success(t("settings:matrixIntegration.toast.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:matrixIntegration.toast.saveError"),
      );
    }
  };

  const handleToggleActive = async (checked: boolean) => {
    try {
      await updateIntegration({
        projectId,
        json: { isActive: checked },
      });
      toast.success(
        checked
          ? t("settings:matrixIntegration.toast.enabled")
          : t("settings:matrixIntegration.toast.disabled"),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:matrixIntegration.toast.updateError"),
      );
    }
  };

  const handleDelete = async () => {
    try {
      await deleteIntegration(projectId);
      form.reset({
        homeserverUrl: "",
        userId: "",
        accessToken: "",
        spaceNamePrefix: "",
        inviteUsers: "",
        taskCreated: true,
        taskStatusChanged: true,
        taskPriorityChanged: false,
        taskTitleChanged: false,
        taskDescriptionChanged: false,
        taskCommentCreated: true,
      });
      toast.success(t("settings:matrixIntegration.toast.removed"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:matrixIntegration.toast.removeError"),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">
                    {t("settings:matrixIntegration.connectionTitle")}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("settings:matrixIntegration.connectionHint")}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {isConnected && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="size-4 text-green-600" />
                    <span>
                      {integration?.isActive
                        ? t("settings:matrixIntegration.connected")
                        : t("settings:matrixIntegration.paused")}
                    </span>
                  </div>
                )}
                <Switch
                  checked={integration?.isActive ?? false}
                  disabled={!isConnected || isBusy}
                  onCheckedChange={handleToggleActive}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="homeserverUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings:matrixIntegration.homeserverLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://matrix.example.com" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:matrixIntegration.homeserverHint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings:matrixIntegration.userLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="@kaneo-bot:example.com" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:matrixIntegration.userHint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accessToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings:matrixIntegration.tokenLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoComplete="off"
                      placeholder={
                        integration?.tokenConfigured
                          ? integration.maskedAccessToken
                          : t("settings:matrixIntegration.tokenPlaceholder")
                      }
                      type="password"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {integration?.tokenConfigured
                      ? t("settings:matrixIntegration.tokenMasked")
                      : t("settings:matrixIntegration.tokenHint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="spaceNamePrefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings:matrixIntegration.spacePrefixLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t(
                        "settings:matrixIntegration.spacePrefixPlaceholder",
                      )}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:matrixIntegration.spacePrefixHint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="inviteUsers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings:matrixIntegration.inviteUsersLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="@alice:example.com, @bob:example.com"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:matrixIntegration.inviteUsersHint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div>
              <h3 className="font-medium">
                {t("settings:matrixIntegration.eventsTitle")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("settings:matrixIntegration.eventsHint")}
              </p>
            </div>

            <EventToggle
              control={form.control}
              label={t("settings:matrixIntegration.events.taskCreated")}
              name="taskCreated"
            />
            <EventToggle
              control={form.control}
              label={t("settings:matrixIntegration.events.taskStatusChanged")}
              name="taskStatusChanged"
            />
            <EventToggle
              control={form.control}
              label={t(
                "settings:matrixIntegration.events.taskPriorityChanged",
              )}
              name="taskPriorityChanged"
            />
            <EventToggle
              control={form.control}
              label={t("settings:matrixIntegration.events.taskTitleChanged")}
              name="taskTitleChanged"
            />
            <EventToggle
              control={form.control}
              label={t(
                "settings:matrixIntegration.events.taskDescriptionChanged",
              )}
              name="taskDescriptionChanged"
            />
            <EventToggle
              control={form.control}
              label={t(
                "settings:matrixIntegration.events.taskCommentCreated",
              )}
              name="taskCommentCreated"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={isBusy} type="submit">
              {isConnected
                ? t("settings:matrixIntegration.saveChanges")
                : t("settings:matrixIntegration.connect")}
            </Button>
            {isConnected && (
              <Button
                disabled={isBusy}
                onClick={handleDelete}
                type="button"
                variant="outline"
              >
                <Trash2 className="size-4" />
                {t("settings:matrixIntegration.disconnect")}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
