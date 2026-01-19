-- Migration: 012_crawler_config
-- Description: Add crawler configuration to system_settings

INSERT INTO system_settings (key, value, description) VALUES
(
    'crawler_config',
    '{
        "llm": {
            "provider": "openai/gpt-4o-mini",
            "baseUrl": "",
            "apiKey": "",
            "temperature": 0.1,
            "maxTokens": 2000
        },
        "adaptive": {
            "minConfidence": 0.5,
            "maxRetry": 2,
            "minContentLength": 100,
            "minWordCount": 20
        },
        "crawler": {
            "timeout": 60000,
            "maxDepth": 3,
            "maxPages": 100
        }
    }',
    'Web crawler and AI extraction configuration'
)
ON CONFLICT (key) DO NOTHING;
