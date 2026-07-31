INSERT INTO lists
  (kind, system_alias, system_key, system_definition_version, name, slug, description, visibility)
VALUES
  ('system', 'max', 'given-name-max', 2, 'Max', 'max', NULL, 'public'),
  ('system', 'luke', 'given-name-luke', 2, 'Luke', 'luke', NULL, 'public'),
  ('system', 'board', 'wca-board', 1, 'Board', 'board', NULL, 'public'),
  ('system', 'delegates', 'wca-delegates', 1, 'Delegates', 'delegates', NULL, 'public')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  system_definition_version = VALUES(system_definition_version);
