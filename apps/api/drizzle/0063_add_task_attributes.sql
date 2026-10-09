CREATE TABLE "task_attribute" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text NOT NULL,
	"icon_color" text NOT NULL,
	"text_color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_attribute" ADD CONSTRAINT "task_attribute_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "task" ADD "attribute_id" text;
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_attribute_id_task_attribute_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "task_attribute"("id") ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "task_attribute_workspaceId_idx" ON "task_attribute" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX "task_attribute_workspace_position_idx" ON "task_attribute" USING btree ("workspace_id","position");
--> statement-breakpoint
CREATE UNIQUE INDEX "task_attribute_workspace_name_unique" ON "task_attribute" USING btree ("workspace_id",lower("name"));
--> statement-breakpoint
CREATE INDEX "task_attributeId_idx" ON "task" USING btree ("attribute_id");
