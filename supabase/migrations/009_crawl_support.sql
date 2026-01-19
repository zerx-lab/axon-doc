ALTER TABLE documents
ADD COLUMN IF NOT EXISTS source_url TEXT,
ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'upload',
ADD COLUMN IF NOT EXISTS source_label TEXT,
ADD COLUMN IF NOT EXISTS parent_url TEXT,
ADD COLUMN IF NOT EXISTS crawl_depth INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS crawled_at TIMESTAMPTZ;

ALTER TABLE documents
ADD CONSTRAINT chk_source_type CHECK (source_type IN ('upload', 'crawl', 'manual', 'api'));

CREATE INDEX IF NOT EXISTS idx_docs_source_url ON documents(source_url);
CREATE INDEX IF NOT EXISTS idx_docs_source_type ON documents(source_type);

CREATE TABLE IF NOT EXISTS crawl_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    kb_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL DEFAULT 'single_url',
    max_depth INTEGER NOT NULL DEFAULT 3,
    max_pages INTEGER NOT NULL DEFAULT 100,
    source_label TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    pages_crawled INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    CONSTRAINT chk_crawl_mode CHECK (mode IN ('single_url', 'full_site')),
    CONSTRAINT chk_crawl_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_kb_id ON crawl_jobs(kb_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_created_at ON crawl_jobs(created_at DESC);

ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_crawl_jobs" ON crawl_jobs FOR ALL USING (true) WITH CHECK (true);

GRANT ALL PRIVILEGES ON crawl_jobs TO anon, authenticated, service_role;
