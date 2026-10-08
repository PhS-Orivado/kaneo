ALTER TABLE "workspace_billing" RENAME COLUMN "creem_customer_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "workspace_billing" RENAME COLUMN "creem_subscription_id" TO "subscription_id";--> statement-breakpoint
ALTER TABLE "workspace_billing" RENAME CONSTRAINT "workspace_billing_creem_subscription_id_unique" TO "workspace_billing_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "workspace_billing" RENAME COLUMN "creem_product_id" TO "product_id";--> statement-breakpoint
ALTER TABLE "workspace_billing" ADD COLUMN "provider" text DEFAULT 'creem' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_limit" ADD COLUMN "max_users" integer;--> statement-breakpoint
ALTER TABLE "workspace_limit" ADD COLUMN "max_projects" integer;--> statement-breakpoint
ALTER TABLE "workspace_limit" ADD COLUMN "max_repositories" integer;--> statement-breakpoint
ALTER TABLE "workspace_limit" ADD COLUMN "storage_bytes" bigint;--> statement-breakpoint
ALTER TABLE "workspace_limit" ADD COLUMN "max_integrations" integer;
