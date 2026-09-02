-- Support explicit unlimited-share pools without changing existing pool data.
ALTER TABLE "boloes"
  ALTER COLUMN "total_cotas" DROP NOT NULL,
  ADD COLUMN "cotas_ilimitadas" BOOLEAN NOT NULL DEFAULT false;

-- Existing pools remain finite; unlimited pools store total_cotas as NULL.
COMMENT ON COLUMN "boloes"."cotas_ilimitadas" IS 'When true, reservations are not capped by total_cotas.';
