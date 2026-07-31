ALTER TABLE app_users
  ADD COLUMN allow_list_inclusion BOOLEAN NOT NULL DEFAULT TRUE AFTER avatar_url,
  ADD INDEX idx_app_users_list_preference (allow_list_inclusion, wca_id);

CREATE TABLE IF NOT EXISTS lists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('user', 'system') NOT NULL DEFAULT 'user',
  public_id CHAR(8) CHARACTER SET ascii COLLATE ascii_bin NULL,
  system_alias VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  system_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  system_definition_version BIGINT UNSIGNED NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  description VARCHAR(500) NULL,
  visibility ENUM('public', 'private') NOT NULL,
  member_count INT UNSIGNED NOT NULL DEFAULT 0,
  membership_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  CONSTRAINT fk_lists_owner
    FOREIGN KEY (owner_user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT chk_lists_identity CHECK (
    (kind = 'user' AND public_id IS NOT NULL AND system_alias IS NULL AND system_key IS NULL AND owner_user_id IS NOT NULL)
    OR
    (kind = 'system' AND public_id IS NULL AND system_alias IS NOT NULL AND system_key IS NOT NULL AND owner_user_id IS NULL AND visibility = 'public')
  ),
  UNIQUE KEY uq_lists_public_id (public_id),
  UNIQUE KEY uq_lists_system_alias (system_alias),
  UNIQUE KEY uq_lists_system_key (system_key),
  INDEX idx_lists_owner_updated (owner_user_id, updated_at),
  INDEX idx_lists_visibility_updated (visibility, updated_at)
);

CREATE TABLE IF NOT EXISTS list_members (
  list_id BIGINT UNSIGNED NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  added_by_user_id BIGINT UNSIGNED NULL,
  source ENUM('owner', 'self_request', 'bulk_import', 'system_rule') NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (list_id, person_id),
  CONSTRAINT fk_list_members_list
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
  CONSTRAINT fk_list_members_added_by
    FOREIGN KEY (added_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  INDEX idx_list_members_person (person_id, list_id)
);

CREATE TABLE IF NOT EXISTS list_membership_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  list_id BIGINT UNSIGNED NOT NULL,
  requester_user_id BIGINT UNSIGNED NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  resolved_at DATETIME(6) NULL,
  resolved_by_user_id BIGINT UNSIGNED NULL,
  CONSTRAINT fk_list_requests_list
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
  CONSTRAINT fk_list_requests_requester
    FOREIGN KEY (requester_user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_list_requests_resolver
    FOREIGN KEY (resolved_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_list_requests_person (list_id, person_id),
  INDEX idx_list_requests_owner_queue (list_id, status, created_at),
  INDEX idx_list_requests_requester (requester_user_id, status)
);

CREATE TABLE IF NOT EXISTS list_exclusions (
  list_id BIGINT UNSIGNED NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason ENUM('self_removed') NOT NULL DEFAULT 'self_removed',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (list_id, person_id),
  CONSTRAINT fk_list_exclusions_list
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
  INDEX idx_list_exclusions_person (person_id, list_id)
);

CREATE TABLE IF NOT EXISTS list_activity_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  list_id BIGINT UNSIGNED NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NULL,
  event_data JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_list_activity_list
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL,
  CONSTRAINT fk_list_activity_actor
    FOREIGN KEY (actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  INDEX idx_list_activity_list_created (list_id, created_at),
  INDEX idx_list_activity_person_created (person_id, created_at)
);

CREATE TABLE IF NOT EXISTS list_import_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  list_id BIGINT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('queued', 'validating', 'ready', 'applying', 'completed', 'failed') NOT NULL DEFAULT 'queued',
  original_row_count INT UNSIGNED NOT NULL DEFAULT 0,
  accepted_count INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  invalid_count INT UNSIGNED NOT NULL DEFAULT 0,
  blocked_count INT UNSIGNED NOT NULL DEFAULT 0,
  failure_message VARCHAR(1000) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  CONSTRAINT fk_list_import_jobs_list
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
  CONSTRAINT fk_list_import_jobs_owner
    FOREIGN KEY (owner_user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  INDEX idx_list_import_jobs_owner_created (owner_user_id, created_at),
  INDEX idx_list_import_jobs_expiry (expires_at)
);

INSERT INTO lists
  (kind, system_alias, system_key, system_definition_version, name, slug, description, visibility)
VALUES
  ('system', 'max', 'given-name-max', 1, 'People named Max', 'max', 'People whose primary WCA display name starts with the exact token Max.', 'public'),
  ('system', 'luke', 'given-name-luke', 1, 'People named Luke', 'luke', 'People whose primary WCA display name starts with the exact token Luke.', 'public')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  system_definition_version = VALUES(system_definition_version);
