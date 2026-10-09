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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { MatrixConnectionMode } from "@/fetchers/matrix-integration/get-matrix-integration";
import {
  useCreateMatrixIntegration,
  useDeleteMatrixIntegration,
  useUpdateMatrixIntegration,
} from "@/hooks/mutations/matrix-integration/use-matrix-integration";
import useGetMatrixIntegration from "@/hooks/queries/matrix-integration/use-get-matrix-integration";
import { toast } from "@/lib/toast";

const eventToggleNames = [
  "taskCreated",
  "taskStatusChanged",
  "taskPriorityChanged",
  "taskTitleChanged",
  "taskDescriptionChanged",
  "taskCommentCreated",
  "taskDeleted",
  "taskMoved",
  "taskDueDateChanged",
  "taskAssigneeChanged",
  "taskUnassigned",
] as const;

type MatrixEventToggleName = (typeof eventToggleNames)[number];

type MatrixIntegrationFormValues = {
  homeserverUrl: string;
  accessToken: string;
  mode: MatrixConnectionMode;
  spaceNamePrefix: string;
  parentSpaceId: string;
  roomId: string;
  inviteUsers: string;
} & Record<MatrixEventToggleName, boolean>;

function EventToggle({
  control,
  name,
  label,
}: {
  control: ReturnType<typeof useForm<MatrixIntegrationFormValues>>["control"];
  name: MatrixEventToggleName;
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

// Room IDs start with !, aliases with #; both carry a homeserver part.
function isValidMatrixRoomReference(value: string): boolean {
  return /^![^:\s]+:[^:\s]+$/.test(value) || /^#[^:\s]+:[^:\s]+$/.test(value);
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
        accessToken: z.string(),
        mode: z.enum(["provision", "existing"]),
        spaceNamePrefix: z.string(),
        parentSpaceId: z.string(),
        roomId: z.string(),
        inviteUsers: z.string(),
        ...Object.fromEntries(
          eventToggleNames.map((name) => [name, z.boolean()]),
        ),
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

  const defaultEventToggles = React.useMemo(
    () =>
      Object.fromEntries(
        eventToggleNames.map((name) => [
          name,
          name === "taskCreated" ||
            name === "taskStatusChanged" ||
            name === "taskCommentCreated" ||
            name === "taskDeleted" ||
            name === "taskMoved" ||
            name === "taskDueDateChanged" ||
            name === "taskAssigneeChanged",
        ]),
      ) as Record<MatrixEventToggleName, boolean>,
    [],
  );

  const normalizedValues = React.useMemo<MatrixIntegrationFormValues>(() => {
    const storedEvents = integration?.events;
    return {
      homeserverUrl: integration?.homeserverUrl ?? "",
      accessToken: "",
      mode: integration?.mode ?? "provision",
      spaceNamePrefix: integration?.spaceNamePrefix ?? "",
      parentSpaceId: integration?.parentSpaceId ?? "",
      roomId: integration?.roomId ?? "",
      inviteUsers: integration?.inviteUsers?.join(", ") ?? "",
      ...Object.fromEntries(
        eventToggleNames.map((name) => [
          name,
          storedEvents?.[name] ?? defaultEventToggles[name],
        ]),
      ),
    };
  }, [integration, defaultEventToggles]);

  const form = useForm<MatrixIntegrationFormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      homeserverUrl: "",
      accessToken: "",
      mode: "provision",
      spaceNamePrefix: "",
      parentSpaceId: "",
      roomId: "",
      inviteUsers: "",
      ...defaultEventToggles,
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
  const selectedMode = form.watch("mode");
  const targetRoom =
    integration?.mode === "existing"
      ? (integration?.roomId ?? null)
      : (integration?.updatesRoomId ?? null);

  const onSubmit = async (values: MatrixIntegrationFormValues) => {
    try {
      const trimmedHomeserverUrl = values.homeserverUrl.trim();
      const trimmedAccessToken = values.accessToken.trim();
      const trimmedSpaceNamePrefix = values.spaceNamePrefix.trim();
      const trimmedParentSpaceId = values.parentSpaceId.trim();
      const trimmedRoomId = values.roomId.trim();
      const trimmedInviteUsers = values.inviteUsers.trim();
      const inviteUsers = trimmedInviteUsers
        ? trimmedInviteUsers
            .split(",")
            .map((user) => user.trim())
            .filter(Boolean)
        : [];
      const events = Object.fromEntries(
        eventToggleNames.map((name) => [name, values[name]]),
      );

      if (!isValidHomeserverUrl(trimmedHomeserverUrl)) {
        form.setError("homeserverUrl", {
          message: t("settings:matrixIntegration.validation.homeserverInvalid"),
        });
        return;
      }

      if (!isConnected && !trimmedAccessToken) {
        form.setError("accessToken", {
          message: t("settings:matrixIntegration.validation.connectionInvalid"),
        });
        return;
      }

      if (!isConnected && values.mode === "existing") {
        if (!trimmedRoomId) {
          form.setError("roomId", {
            message: t(
              "settings:matrixIntegration.validation.connectionInvalid",
            ),
          });
          return;
        }

        if (!isValidMatrixRoomReference(trimmedRoomId)) {
          form.setError("roomId", {
            message: t("settings:matrixIntegration.validation.roomIdInvalid"),
          });
          return;
        }
      }

      if (!isConnected) {
        await createIntegration({
          projectId,
          data: {
            homeserverUrl: trimmedHomeserverUrl,
            accessToken: trimmedAccessToken,
            mode: values.mode,
            spaceNamePrefix: trimmedSpaceNamePrefix || undefined,
            parentSpaceId: trimmedParentSpaceId || undefined,
            roomId: trimmedRoomId || undefined,
            inviteUsers: inviteUsers.length > 0 ? inviteUsers : undefined,
            events,
          },
        });
      } else {
        await updateIntegration({
          projectId,
          json: {
            homeserverUrl: trimmedHomeserverUrl,
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
        accessToken: "",
        spaceNamePrefix: trimmedSpaceNamePrefix,
        parentSpaceId: trimmedParentSpaceId,
        roomId: trimmedRoomId,
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
        accessToken: "",
        mode: "provision",
        spaceNamePrefix: "",
        parentSpaceId: "",
        roomId: "",
        inviteUsers: "",
        ...defaultEventToggles,
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

            {!isConnected && (
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("settings:matrixIntegration.modeLabel")}
                    </FormLabel>
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value as MatrixConnectionMode)
                      }
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="provision">
                          {t("settings:matrixIntegration.modeProvision")}
                        </SelectItem>
                        <SelectItem value="existing">
                          {t("settings:matrixIntegration.modeExisting")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {selectedMode === "existing"
                        ? t("settings:matrixIntegration.modeExistingHint")
                        : t("settings:matrixIntegration.modeProvisionHint")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isConnected && (
              <div className="grid gap-2 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">
                    {t("settings:matrixIntegration.modeLabel")}:
                  </span>{" "}
                  {integration?.mode === "existing"
                    ? t("settings:matrixIntegration.modeExisting")
                    : t("settings:matrixIntegration.modeProvision")}
                </p>
                {integration?.botUserId && (
                  <p>
                    <span className="font-medium text-foreground">
                      {t("settings:matrixIntegration.botUserLabel")}:
                    </span>{" "}
                    {integration.botUserId}
                  </p>
                )}
                {targetRoom && (
                  <p>
                    <span className="font-medium text-foreground">
                      {t("settings:matrixIntegration.targetRoomLabel")}:
                    </span>{" "}
                    {targetRoom}
                  </p>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="homeserverUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings:matrixIntegration.homeserverLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://matrix.example.com"
                    />
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

            {!isConnected && selectedMode === "existing" && (
              <FormField
                control={form.control}
                name="roomId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("settings:matrixIntegration.roomIdLabel")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="#kaneo-updates:example.com"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:matrixIntegration.roomIdHint")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {selectedMode === "provision" && (
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
            )}

            {selectedMode === "provision" && (
              <FormField
                control={form.control}
                name="parentSpaceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("settings:matrixIntegration.parentSpaceLabel")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="#kaneo:example.com" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:matrixIntegration.parentSpaceHint")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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

            {eventToggleNames.map((name) => (
              <EventToggle
                control={form.control}
                key={name}
                label={t(`settings:matrixIntegration.events.${name}`)}
                name={name}
              />
            ))}
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
