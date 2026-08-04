-- Person-backed ranking pages join projection rows to the canonical WCA person.
-- Candidate schemas intentionally contain projection tables only, so keep this
-- migration safe for both the production schema and candidate initialization.
ALTER TABLE IF EXISTS persons
ADD INDEX IF NOT EXISTS idx_persons_wca_sub (wca_id, sub_id);
