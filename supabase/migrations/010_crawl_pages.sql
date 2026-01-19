-- Migration: Add crawl_pages table for granular page tracking
-- Extends crawl_jobs with more status options and adds crawl_pages for real-time progress

-- Extend crawl_jobs status constraint to include paused and cancelled
ALTER TABLE crawl_jobs DROP CONSTRAINT IF EXISTS chk_crawl_status;
ALTER TABLE crawl_jobs ADD CONSTRAINT chk_crawl_status 
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled'));

-- Add user_id to crawl_jobs for ownership tracking
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add total_pages for progress calculation
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0;

-- Add failed_pages count
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS failed_pages INTEGER DEFAULT 0;

-- Add settings JSONB for additional configuration
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Create crawl_pages table for tracking individual page crawl status
CREATE TABLE IF NOT EXISTS crawl_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    content_hash TEXT,
    title TEXT,
    depth INTEGER DEFAULT 0,
    error_message TEXT,
    crawled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_page_status CHECK (status IN ('pending', 'crawling', 'completed', 'failed', 'skipped')),
    CONSTRAINT uq_job_url UNIQUE (job_id, url)
);

-- Create indexes for crawl_pages
CREATE INDEX IF NOT EXISTS idx_crawl_pages_job_id ON crawl_pages(job_id);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_status ON crawl_pages(status);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_url ON crawl_pages(url);

-- Enable RLS on crawl_pages
ALTER TABLE crawl_pages ENABLE ROW LEVEL SECURITY;

-- RLS policy for crawl_pages (service role has full access)
CREATE POLICY "service_role_all_crawl_pages" ON crawl_pages 
    FOR ALL USING (true) WITH CHECK (true);

-- Grant privileges
GRANT ALL PRIVILEGES ON crawl_pages TO anon, authenticated, service_role;

-- Add comment for documentation
COMMENT ON TABLE crawl_pages IS 'Tracks individual page crawl status for real-time progress updates';
COMMENT ON TABLE crawl_jobs IS 'Manages web crawl jobs with support for full-site and specific URL crawling';
