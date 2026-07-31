-- Keep the export identity in the same canonical form emitted by the WCA API.
UPDATE export_metadata
SET value = CONCAT(SUBSTRING(value, 1, 10), 'T', SUBSTRING(value, 12, 8), 'Z')
WHERE `key` = 'export_date'
  AND value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} UTC$';
