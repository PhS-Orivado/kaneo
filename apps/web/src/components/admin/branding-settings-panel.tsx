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
import type { BrandingSettings } from "@/fetchers/admin/get-branding";
import useUpdateBranding from "@/hooks/mutations/admin/use-update-branding";
import useGetBranding from "@/hooks/queries/admin/use-get-branding";

const DEFAULT_BRANDING: BrandingSettings = {
  appName: null,
  logoLightUrl: null,
  logoDarkUrl: null,
  accentColor: null,
  footerText: null,
  footerUrl: null,
  termsUrl: null,
  privacyUrl: null,
  showPoweredBy: true,
};

type TextBrandingField = Exclude<keyof BrandingSettings, "showPoweredBy">;

function fieldValue(value: string | null) {
  return value ?? "";
}

function optionalInput(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function BrandingSettingsPanel() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useGetBranding();
  const { mutateAsync: saveBranding, isPending: isSaving } =
    useUpdateBranding();
  const [form, setForm] = useState<BrandingSettings>(DEFAULT_BRANDING);

  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  const setOptionalText =
    (field: TextBrandingField) => (event: { target: { value: string } }) =>
      setForm((current) => ({
        ...current,
        [field]: optionalInput(event.target.value),
      }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveBranding(form);
  };

  return (
    <SettingsPage
      className="max-w-3xl"
      title={
        <span className="flex items-center gap-2">
          {t("settings:adminBranding.title")}
          <Badge variant="outline" size="sm">
            {t("settings:adminBranding.instanceBadge")}
          </Badge>
        </span>
      }
      description={t("settings:adminBranding.subtitle")}
    >
      {isLoading ? (
        <section className="space-y-5 rounded-xl border bg-card p-4 shadow-xs/5">
          {["one", "two", "three", "four", "five"].map((key) => (
            <Skeleton key={key} className="h-10 w-full" />
          ))}
        </section>
      ) : isError ? (
        <section className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center shadow-xs/5">
          <p className="text-sm text-muted-foreground">
            {t("settings:adminBranding.loadError")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCwIcon aria-hidden="true" />
            {t("settings:adminBranding.retry")}
          </Button>
        </section>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <section className="space-y-5 rounded-xl border bg-card p-4 shadow-xs/5">
            <Field>
              <FieldLabel htmlFor="branding-app-name">
                {t("settings:adminBranding.form.appName")}
              </FieldLabel>
              <Input
                id="branding-app-name"
                maxLength={100}
                value={fieldValue(form.appName)}
                onChange={setOptionalText("appName")}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings:adminBranding.form.appNameDescription")}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="branding-logo-light">
                {t("settings:adminBranding.form.logoLightUrl")}
              </FieldLabel>
              <Input
                id="branding-logo-light"
                type="url"
                maxLength={2048}
                value={fieldValue(form.logoLightUrl)}
                onChange={setOptionalText("logoLightUrl")}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings:adminBranding.form.logoDescription")}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="branding-logo-dark">
                {t("settings:adminBranding.form.logoDarkUrl")}
              </FieldLabel>
              <Input
                id="branding-logo-dark"
                type="url"
                maxLength={2048}
                value={fieldValue(form.logoDarkUrl)}
                onChange={setOptionalText("logoDarkUrl")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="branding-accent">
                {t("settings:adminBranding.form.accentColor")}
              </FieldLabel>
              <Input
                id="branding-accent"
                maxLength={7}
                placeholder="#4f46e5"
                value={fieldValue(form.accentColor)}
                onChange={setOptionalText("accentColor")}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings:adminBranding.form.accentColorDescription")}
              </p>
            </Field>
          </section>

          <section className="space-y-5 rounded-xl border bg-card p-4 shadow-xs/5">
            <Field>
              <FieldLabel htmlFor="branding-footer-text">
                {t("settings:adminBranding.form.footerText")}
              </FieldLabel>
              <Input
                id="branding-footer-text"
                maxLength={200}
                value={fieldValue(form.footerText)}
                onChange={setOptionalText("footerText")}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings:adminBranding.form.footerDescription")}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="branding-footer-url">
                {t("settings:adminBranding.form.footerUrl")}
              </FieldLabel>
              <Input
                id="branding-footer-url"
                type="url"
                maxLength={2048}
                value={fieldValue(form.footerUrl)}
                onChange={setOptionalText("footerUrl")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="branding-terms-url">
                {t("settings:adminBranding.form.termsUrl")}
              </FieldLabel>
              <Input
                id="branding-terms-url"
                type="url"
                maxLength={2048}
                value={fieldValue(form.termsUrl)}
                onChange={setOptionalText("termsUrl")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="branding-privacy-url">
                {t("settings:adminBranding.form.privacyUrl")}
              </FieldLabel>
              <Input
                id="branding-privacy-url"
                type="url"
                maxLength={2048}
                value={fieldValue(form.privacyUrl)}
                onChange={setOptionalText("privacyUrl")}
              />
              <p className="text-xs text-muted-foreground">
                {t("settings:adminBranding.form.legalDescription")}
              </p>
            </Field>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="branding-show-powered-by">
                  {t("settings:adminBranding.form.showPoweredBy")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings:adminBranding.form.showPoweredByDescription")}
                </p>
              </div>
              <Switch
                id="branding-show-powered-by"
                checked={form.showPoweredBy}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    showPoweredBy: checked,
                  }))
                }
              />
            </div>
          </section>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => setForm(DEFAULT_BRANDING)}
            >
              {t("settings:adminBranding.form.reset")}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? t("settings:adminBranding.form.saving")
                : t("settings:adminBranding.form.save")}
            </Button>
          </div>
        </form>
      )}
    </SettingsPage>
  );
}

export default BrandingSettingsPanel;
