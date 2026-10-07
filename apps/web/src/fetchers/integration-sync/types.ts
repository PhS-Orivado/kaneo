import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono";

type SyncRoute =
  (typeof client)["integration-sync"]["project"][":projectId"][":provider"];
export type SyncParams = InferRequestType<SyncRoute["$get"]>["param"];
export type SyncRules = InferRequestType<SyncRoute["$patch"]>["json"]["rules"];
export type LabelRule = SyncRules["outgoing"];
export type SyncPreview = InferResponseType<SyncRoute["$get"], 200>;
export type ResumePreview = InferResponseType<
  SyncRoute["links"][":linkId"]["review"]["$get"],
  200
>;

// RFC 0001 WP5/WP7: the sync surface is addressed either project-wide over the
// provider (the legacy scope, which the API resolves to the project's first
// binding) or directly by the repository binding that owns the rules.
export type SyncScope =
  | { kind: "project"; projectId: string; provider: string }
  | { kind: "binding"; integrationId: string };

/**
 * Stable, serializable key fields of a scope. The same fields appear in every
 * query key and placeholder comparison of the sync surface, so a switch
 * between scopes never reuses a previous scope's cache.
 */
export function syncScopeKey(scope: SyncScope): {
  projectId: string;
  provider: string;
  integrationId: string;
} {
  return scope.kind === "binding"
    ? { projectId: "", provider: "", integrationId: scope.integrationId }
    : {
        projectId: scope.projectId,
        provider: scope.provider,
        integrationId: "",
      };
}
