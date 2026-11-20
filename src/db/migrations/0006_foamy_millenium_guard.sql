CREATE TABLE "splits" (
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"ratio" numeric(20, 10) NOT NULL,
	CONSTRAINT "splits_symbol_date_pk" PRIMARY KEY("symbol","date")
);
