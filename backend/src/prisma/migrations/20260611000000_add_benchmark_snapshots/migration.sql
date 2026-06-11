-- Anonymous peer-benchmark snapshots.
-- One row per (band, metric). "summary" contains ONLY aggregate statistics
-- (percentile breakpoints / median); never raw per-user values or identities.
CREATE TABLE "BenchmarkSnapshot" (
    "id" SERIAL NOT NULL,
    "band" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkSnapshot_pkey" PRIMARY KEY ("id")
);

-- Each (band, metric) pair has exactly one current snapshot; refresh is an upsert.
CREATE UNIQUE INDEX "BenchmarkSnapshot_band_metric_key" ON "BenchmarkSnapshot"("band", "metric");
