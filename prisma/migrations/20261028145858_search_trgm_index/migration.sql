-- Búsqueda tolerante a erratas sobre descripción + notas (ver schema.prisma, Transaction).
-- Índice de expresión: Prisma no lo modela en el schema, vive sólo en esta migración.
-- Las consultas deben usar EXACTAMENTE la misma expresión para aprovecharlo:
--   (coalesce(description,'') || ' ' || coalesce(notes,'')) ILIKE '%term%'  /  % term
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "transactions_search_trgm" ON "transactions"
  USING gin ((coalesce("description", '') || ' ' || coalesce("notes", '')) gin_trgm_ops);
