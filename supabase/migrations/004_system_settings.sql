-- AxonBase System Settings Migration
-- Add system_settings table for storing application configuration

CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to system_settings"
    ON system_settings FOR ALL
    USING (true)
    WITH CHECK (true);

GRANT ALL PRIVILEGES ON TABLE system_settings TO anon, authenticated, service_role;

INSERT INTO system_settings (key, value, description) VALUES
(
    'embedding_config',
    '{
        "provider": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "",
        "model": "text-embedding-3-small",
        "batchSize": 100,
        "chunkSize": 512,
        "chunkOverlap": 100
    }',
    'Vector embedding model configuration'
)
ON CONFLICT (key) DO NOTHING;
