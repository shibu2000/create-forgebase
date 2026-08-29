CREATE TABLE "master_data_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"label" varchar(255) NOT NULL,
	"meta" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_data_items_type_id_code_key" UNIQUE("type_id","code")
);
--> statement-breakpoint
CREATE TABLE "master_data_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_data_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "master_data_items" ADD CONSTRAINT "master_data_items_type_id_master_data_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."master_data_types"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "master_data_items_type_id_idx" ON "master_data_items" USING btree ("type_id");