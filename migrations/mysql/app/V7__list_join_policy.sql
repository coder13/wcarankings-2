ALTER TABLE lists
ADD COLUMN join_policy ENUM('open', 'closed') NOT NULL DEFAULT 'closed' AFTER visibility,
ADD INDEX idx_lists_visibility_join_policy (visibility, join_policy, updated_at);
