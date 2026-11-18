import { RefreshCwIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsPage } from "@/components/settings/settings-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { InstanceConfig } from "@/fetchers/admin/get-instance-config";
import type { UpdateInstanceConfigInput } from "@/fetchers/admin/update-instance-config";
import useUpdateInstanceConfig from "@/hooks/mutations/admin/use-update-instance-config";
import useGetInstanceConfig from "@/hooks/queries/admin/use-get-instance-config";

type SmtpTextField = Exclude<
  keyof UpdateInstanceConfigInput["smtp"],
  "port" | "secure" | "requireTls" | "password"
>;

type S3TextField = Exclude<
  keyof UpdateInstanceConfigInput["s3"],
  "forcePathStyle" | "secretAccessKey"
>;

function fieldValue(value: string | null) {
  return value ?? "";
}

function optionalInput(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toForm(config: InstanceConfig): UpdateInstanceConfigInput {
  return {
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      requireTls: config.smtp.requireTls,
      user: config.smtp.user,
      // Secrets are never returned; empty means keep the stored value.
      password: null,
      from: config.smtp.from,
    },
    s3: {
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      bucket: config.s3.bucket,
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: null,
      publicBaseUrl: config.s3.publicBaseUrl,
      keyPrefix: config.s3.keyPrefix,
      forcePathStyle: config.s3.forcePathStyle,
    },
  };
}

function InstanceConfigSettingsPanel() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useGetInstanceConfig();
  const { mutateAsync: saveConfig, isPending: isSaving } =
    useUpdateInstanceConfig();
  const [form, setForm] = useState<UpdateInstanceConfigInput | null>(null);

  useEffect(() => {
    if (data) {
      setForm(toForm(data));
    }
  }, [data]);

  const setSmtpText =
    (field: SmtpTextField) => (event: { target: { value: string } }) =>
      setForm((current) =>
        current
          ? {
              ...current,
              smtp: {
                ...current.smtp,
                [field]: optionalInput(event.target.value),
              },
            }
          : current,
      );

  const setS3Text =
    (field: S3TextField) => (event: { target: { value: string } }) =>
      setForm((current) =>
        current
          ? {
              ...current,
              s3: {
                ...current.s3,
                [field]: optionalInput(event.target.value),
              },
            }
          : current,
      );

  const setSmtpPassword = (event: { target: { value: string } }) =>
    setForm((current) =>
      current
        ? {
            ...current,
            smtp: {
              ...current.smtp,
              password: optionalInput(event.target.value),
            },
          }
        : current,
    );

  const setS3SecretAccessKey = (event: { target: { value: string } }) =>
    setForm((current) =>
      current
        ? {
            ...current,
            s3: {
              ...current.s3,
              secretAccessKey: optionalInput(event.target.value),
            },
          }
        : current,
    );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form) {
      await saveConfig(form);
    }
  };

  return (
    <SettingsPage
      className="max-w-3xl"
      title={
        <span className="flex items-center gap-2">
          {t("settings:adminInstanceConfig.title")}
          <Badge variant="outline" size="sm">
            {t("settings:adminInstanceConfig.instanceBadge")}
          </Badge>
        </span>
      }
      description={t("settings:adminInstanceConfig.subtitle")}
    >
      {isLoading ? (
        <section className="space-y-5 rounded-xl border bg-card p-4 shadow-xs/5">
          {["one", "two", "three", "four", "five"].map((key) => (
            <Skeleton key={key} className="h-10 w-full" />
          ))}
        </section>
      ) : isError || !form ? (
        <section className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center shadow-xs/5">
          <p className="text-sm text-muted-foreground">
            {t("settings:adminInstanceConfig.loadError")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCwIcon aria-hidden="true" />
            {t("settings:adminInstanceConfig.retry")}
          </Button>
        </section>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">
            {t("settings:adminInstanceConfig.envHint")}
          </p>

          <section className="space-y-5 rounded-xl border bg-card p-4 shadow-xs/5">
            <h2 className="text-sm font-semibold">
              {t("settings:adminInstanceConfig.smtp.title")}
            </h2>
            <Field>
              <FieldLabel htmlFor="instance-config-smtp-host">
                {t("settings:adminInstanceConfig.smtp.host")}
              </FieldLabel>
              <Input
                id="instance-config-smtp-host"
                maxLength={500}
                placeholder="smtp.example.com"
                value={fieldValue(form.smtp.host)}
                onChange={setSmtpText("host")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-smtp-port">
                {t("settings:adminInstanceConfig.smtp.port")}
              </FieldLabel>
              <Input
                id="instance-config-smtp-port"
                type="number"
                min={1}
                max={65535}
                value={form.smtp.port ?? ""}
                onChange={(event) =>
                  setForm((current) => {
                    if (!current) {
                      return current;
                    }
                    const raw = event.target.value.trim();
                    return {
                      ...current,
                      smtp: {
                        ...current.smtp,
                        port: raw.length === 0 ? null : Number(raw),
                      },
                    };
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("settings:adminInstanceConfig.smtp.portHint")}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-smtp-from">
                {t("settings:adminInstanceConfig.smtp.from")}
              </FieldLabel>
              <Input
                id="instance-config-smtp-from"
                maxLength={500}
                placeholder="no-reply@example.com"
                value={fieldValue(form.smtp.from)}
                onChange={setSmtpText("from")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-smtp-user">
                {t("settings:adminInstanceConfig.smtp.user")}
              </FieldLabel>
              <Input
                id="instance-config-smtp-user"
                maxLength={500}
                autoComplete="off"
                value={fieldValue(form.smtp.user)}
                onChange={setSmtpText("user")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-smtp-password">
                {t("settings:adminInstanceConfig.smtp.password")}
              </FieldLabel>
              <Input
                id="instance-config-smtp-password"
                type="password"
                autoComplete="new-password"
                value={fieldValue(form.smtp.password)}
                onChange={setSmtpPassword}
              />
              {data?.smtp.passwordSet ? (
                <p className="text-xs text-muted-foreground">
                  {t("settings:adminInstanceConfig.smtp.secretSetHint")}
                </p>
              ) : undefined}
            </Field>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="instance-config-smtp-secure">
                  {t("settings:adminInstanceConfig.smtp.secure")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings:adminInstanceConfig.smtp.secureHint")}
                </p>
              </div>
              <Switch
                id="instance-config-smtp-secure"
                checked={form.smtp.secure}
                onCheckedChange={(checked) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          smtp: { ...current.smtp, secure: checked },
                        }
                      : current,
                  )
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="instance-config-smtp-require-tls">
                  {t("settings:adminInstanceConfig.smtp.requireTls")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings:adminInstanceConfig.smtp.requireTlsHint")}
                </p>
              </div>
              <Switch
                id="instance-config-smtp-require-tls"
                checked={form.smtp.requireTls}
                onCheckedChange={(checked) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          smtp: { ...current.smtp, requireTls: checked },
                        }
                      : current,
                  )
                }
              />
            </div>
          </section>

          <section className="space-y-5 rounded-xl border bg-card p-4 shadow-xs/5">
            <h2 className="text-sm font-semibold">
              {t("settings:adminInstanceConfig.s3.title")}
            </h2>
            <Field>
              <FieldLabel htmlFor="instance-config-s3-endpoint">
                {t("settings:adminInstanceConfig.s3.endpoint")}
              </FieldLabel>
              <Input
                id="instance-config-s3-endpoint"
                type="url"
                maxLength={500}
                placeholder="https://s3.example.com"
                value={fieldValue(form.s3.endpoint)}
                onChange={setS3Text("endpoint")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-s3-bucket">
                {t("settings:adminInstanceConfig.s3.bucket")}
              </FieldLabel>
              <Input
                id="instance-config-s3-bucket"
                maxLength={500}
                value={fieldValue(form.s3.bucket)}
                onChange={setS3Text("bucket")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-s3-region">
                {t("settings:adminInstanceConfig.s3.region")}
              </FieldLabel>
              <Input
                id="instance-config-s3-region"
                maxLength={500}
                placeholder="us-east-1"
                value={fieldValue(form.s3.region)}
                onChange={setS3Text("region")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-s3-access-key-id">
                {t("settings:adminInstanceConfig.s3.accessKeyId")}
              </FieldLabel>
              <Input
                id="instance-config-s3-access-key-id"
                maxLength={500}
                autoComplete="off"
                value={fieldValue(form.s3.accessKeyId)}
                onChange={setS3Text("accessKeyId")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-s3-secret-access-key">
                {t("settings:adminInstanceConfig.s3.secretAccessKey")}
              </FieldLabel>
              <Input
                id="instance-config-s3-secret-access-key"
                type="password"
                autoComplete="new-password"
                value={fieldValue(form.s3.secretAccessKey)}
                onChange={setS3SecretAccessKey}
              />
              {data?.s3.secretAccessKeySet ? (
                <p className="text-xs text-muted-foreground">
                  {t("settings:adminInstanceConfig.s3.secretSetHint")}
                </p>
              ) : undefined}
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-s3-public-base-url">
                {t("settings:adminInstanceConfig.s3.publicBaseUrl")}
              </FieldLabel>
              <Input
                id="instance-config-s3-public-base-url"
                type="url"
                maxLength={500}
                value={fieldValue(form.s3.publicBaseUrl)}
                onChange={setS3Text("publicBaseUrl")}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings:adminInstanceConfig.s3.publicBaseUrlHint")}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="instance-config-s3-key-prefix">
                {t("settings:adminInstanceConfig.s3.keyPrefix")}
              </FieldLabel>
              <Input
                id="instance-config-s3-key-prefix"
                maxLength={500}
                value={fieldValue(form.s3.keyPrefix)}
                onChange={setS3Text("keyPrefix")}
              />
            </Field>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="instance-config-s3-force-path-style">
                  {t("settings:adminInstanceConfig.s3.forcePathStyle")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings:adminInstanceConfig.s3.forcePathStyleHint")}
                </p>
              </div>
              <Switch
                id="instance-config-s3-force-path-style"
                checked={form.s3.forcePathStyle}
                onCheckedChange={(checked) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          s3: { ...current.s3, forcePathStyle: checked },
                        }
                      : current,
                  )
                }
              />
            </div>
          </section>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => data && setForm(toForm(data))}
            >
              {t("settings:adminInstanceConfig.form.reset")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? t("settings:adminInstanceConfig.form.saving")
                : t("settings:adminInstanceConfig.form.save")}
            </Button>
          </div>
        </form>
      )}
    </SettingsPage>
  );
}

export default InstanceConfigSettingsPanel;
