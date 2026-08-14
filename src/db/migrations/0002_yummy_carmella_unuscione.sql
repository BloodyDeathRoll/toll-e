CREATE TABLE "broker_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"broker_id" text,
	"tier_id" text,
	"overrides" jsonb,
	"account_fee_waived_until" date,
	"answered_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broker_profiles" ADD CONSTRAINT "broker_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broker_profiles_userId_idx" ON "broker_profiles" USING btree ("user_id");