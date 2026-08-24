CREATE TABLE "symbol_i18n" (
	"symbol" text NOT NULL,
	"lang" text NOT NULL,
	"field" text NOT NULL,
	"text" text NOT NULL,
	"origin" text NOT NULL,
	"source_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "symbol_i18n_symbol_lang_field_pk" PRIMARY KEY("symbol","lang","field")
);
