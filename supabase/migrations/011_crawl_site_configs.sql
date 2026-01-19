-- Migration: 011_crawl_site_configs
-- Description: Add site extraction configs table for adaptive crawling
-- This table stores AI-generated CSS selectors for different websites,
-- enabling fast subsequent crawls without repeated AI analysis.

-- Site extraction configurations table
CREATE TABLE IF NOT EXISTS crawl_site_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Matching rules
    domain TEXT NOT NULL,
    path_pattern TEXT NOT NULL DEFAULT '*',
    
    -- AI-generated extraction configuration
    css_selector TEXT,
    excluded_selector TEXT,
    title_selector TEXT DEFAULT 'h1',
    excluded_tags TEXT[] DEFAULT ARRAY['nav', 'footer', 'aside', 'header', 'script', 'style', 'noscript', 'iframe'],
    
    -- Detection metadata
    framework_detected TEXT,
    confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
    
    -- Learning statistics
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    
    -- AI analysis context
    analysis_prompt TEXT,
    sample_url TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Constraints
    CONSTRAINT uq_domain_path_pattern UNIQUE (domain, path_pattern),
    CONSTRAINT chk_framework CHECK (
        framework_detected IS NULL OR 
        framework_detected IN ('docusaurus', 'gitbook', 'vuepress', 'mkdocs', 'sphinx', 'readthedocs', 'confluence', 'notion', 'generic')
    )
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_site_configs_domain ON crawl_site_configs(domain);
CREATE INDEX IF NOT EXISTS idx_site_configs_domain_path ON crawl_site_configs(domain, path_pattern);
CREATE INDEX IF NOT EXISTS idx_site_configs_framework ON crawl_site_configs(framework_detected) WHERE framework_detected IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_configs_confidence ON crawl_site_configs(confidence DESC);

-- Function to update timestamp on modification
CREATE OR REPLACE FUNCTION update_site_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trg_site_config_updated ON crawl_site_configs;
CREATE TRIGGER trg_site_config_updated
    BEFORE UPDATE ON crawl_site_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_site_config_timestamp();

-- Function to increment success count
CREATE OR REPLACE FUNCTION increment_site_config_success(config_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE crawl_site_configs
    SET 
        success_count = success_count + 1,
        last_success_at = NOW(),
        confidence = LEAST(1.0, confidence + 0.01)
    WHERE id = config_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment failure count
CREATE OR REPLACE FUNCTION increment_site_config_failure(config_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE crawl_site_configs
    SET 
        failure_count = failure_count + 1,
        last_failure_at = NOW(),
        confidence = GREATEST(0.1, confidence - 0.05)
    WHERE id = config_id;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE crawl_site_configs ENABLE ROW LEVEL SECURITY;

-- RLS policy for service role (full access)
CREATE POLICY "service_role_all_site_configs" ON crawl_site_configs
    FOR ALL USING (true) WITH CHECK (true);

-- Grant privileges
GRANT ALL PRIVILEGES ON crawl_site_configs TO anon, authenticated, service_role;

-- Add comments for documentation
COMMENT ON TABLE crawl_site_configs IS 'Stores AI-generated extraction configurations for websites, enabling adaptive crawling with learning capabilities';
COMMENT ON COLUMN crawl_site_configs.domain IS 'Website domain (e.g., docs.example.com)';
COMMENT ON COLUMN crawl_site_configs.path_pattern IS 'URL path pattern with wildcard support (e.g., /docs/*, /api/*)';
COMMENT ON COLUMN crawl_site_configs.css_selector IS 'CSS selector for main content area';
COMMENT ON COLUMN crawl_site_configs.excluded_selector IS 'CSS selectors to exclude (comma-separated)';
COMMENT ON COLUMN crawl_site_configs.framework_detected IS 'Detected documentation framework';
COMMENT ON COLUMN crawl_site_configs.confidence IS 'Confidence score (0-1), adjusted based on success/failure';
COMMENT ON COLUMN crawl_site_configs.success_count IS 'Number of successful extractions using this config';
COMMENT ON COLUMN crawl_site_configs.failure_count IS 'Number of failed extractions using this config';
