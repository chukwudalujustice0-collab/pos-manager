/*
# App Settings — configurable serial number validation rules

1. New Tables
- `app_settings` (key/value store, single row per key)
  - `key` (text, primary key) — e.g. 'serial_rules'
  - `value` (jsonb) — rule configuration
  - `updated_by` (uuid) — user who last changed it
  - `updated_at` (timestamptz)

2. Purpose
- Lets the owner define the expected POS serial number format
  (prefix, min/max length, character set) used by OCR scanning
  and manual validation, without a code change.

3. Security
- RLS enabled: staff can read, only owner can write.
*/

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select" ON app_settings;
CREATE POLICY "app_settings_select" ON app_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "app_settings_update" ON app_settings;
CREATE POLICY "app_settings_update" ON app_settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
  );

DROP POLICY IF EXISTS "app_settings_insert" ON app_settings;
CREATE POLICY "app_settings_insert" ON app_settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
  );
