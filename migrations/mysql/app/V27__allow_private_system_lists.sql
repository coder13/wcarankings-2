ALTER TABLE lists
  DROP CONSTRAINT chk_lists_identity,
  ADD CONSTRAINT chk_lists_identity CHECK (
    (kind = 'user' AND public_id IS NOT NULL AND system_alias IS NULL AND system_key IS NULL AND owner_user_id IS NOT NULL)
    OR
    (kind = 'system' AND public_id IS NULL AND system_alias IS NOT NULL AND system_key IS NOT NULL AND owner_user_id IS NULL)
  );
