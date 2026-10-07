import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { RepositoryBindingUsage } from "@/types/repository-binding";

/**
 * RFC 0001 WP10: the quota indicator next to the section heading. The badge
 * renders only the server-provided usage summary; the client never counts
 * bindings itself, so the badge cannot drift from the server's truth.
 */
export function RepositoryUsageBadge({ usage }: { usage: RepositoryBindingUsage }) {
  const { t } = useTranslation();

  return (
    <Badge variant="secondary">
      {usage.limit === null
        ? t("settings:repositoryBindings.usageUnlimited", {
            used: usage.used,
          })
        : t("settings:repositoryBindings.usageLimited", {
            used: usage.used,
            limit: usage.limit,
          })}
    </Badge>
  );
}
