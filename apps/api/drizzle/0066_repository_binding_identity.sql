ALTER TABLE "integration" ADD COLUMN "repository_key" text;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "repository_owner" text;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "repository_name" text;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "repository_id" integer;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "base_url" text;--> statement-breakpoint
ALTER TABLE "integration" DROP CONSTRAINT "integration_project_type_unique";--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_project_type_repo_unique" UNIQUE("project_id","type","repository_key");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_project_type_null_repo_unique" ON "integration" USING btree ("project_id","type") WHERE "integration"."repository_key" is null;--> statement-breakpoint
CREATE INDEX "integration_type_repository_key_idx" ON "integration" USING btree ("type","repository_key");--> statement-breakpoint
ALTER TABLE "workflow_rule" ADD COLUMN "integration_id" text;--> statement-breakpoint
ALTER TABLE "workflow_rule" ADD CONSTRAINT "workflow_rule_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "workflow_rule_integrationId_idx" ON "workflow_rule" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "workflow_rule_resolution_idx" ON "workflow_rule" USING btree ("project_id","integration_type","event_type","integration_id");--> statement-breakpoint
CREATE TABLE "workspace_limit" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"max_repositories_per_project" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_limit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade
);--> statement-breakpoint
