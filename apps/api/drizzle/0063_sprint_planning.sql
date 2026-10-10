CREATE TABLE "sprint" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"status" text DEFAULT 'future' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sprint_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade
);--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "sprint_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "default_sprint_length_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_sprint_id_sprint_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprint"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sprint" ADD CONSTRAINT "sprint_project_name_unique" UNIQUE("project_id","name");--> statement-breakpoint
CREATE INDEX "sprint_projectId_idx" ON "sprint" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sprint_projectId_position_idx" ON "sprint" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_project_active_unique" ON "sprint" USING btree ("project_id") WHERE "sprint"."status" = 'active';--> statement-breakpoint
CREATE INDEX "task_sprintId_idx" ON "task" USING btree ("sprint_id");
