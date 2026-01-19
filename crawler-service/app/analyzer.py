"""AI-powered page structure analyzer for adaptive crawling."""

import json
import logging
from typing import Any

from litellm import completion

from app.models import AnalysisResult, SiteConfig, FRAMEWORK_PRESETS
from app.settings_loader import LLMSettings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a web page structure analysis expert. Your task is to analyze HTML and identify the main content area and elements to exclude.

IMPORTANT: Return ONLY valid JSON, no other text or markdown.

JSON Schema:
{
    "css_selector": "CSS selector for main content area",
    "excluded_selector": "CSS selectors to exclude (comma-separated)",
    "title_selector": "CSS selector for page title",
    "framework_detected": "docusaurus|gitbook|vuepress|mkdocs|sphinx|readthedocs|confluence|notion|generic|null",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation of analysis"
}

Framework Detection Patterns:
- Docusaurus: .theme-doc-markdown, docMainContainer, __docusaurus
- GitBook: .markdown-section, .book-summary, gitbook
- VuePress: .theme-default-content, vuepress
- MkDocs: .md-content, mkdocs
- Sphinx: .sphinxsidebar, sphinx
- ReadTheDocs: .rst-content, readthedocs
- Confluence: confluence, wiki-content
- Notion: notion-page-content

Content Selection Guidelines:
1. Look for semantic HTML: <article>, <main>, [role="main"]
2. Look for content-specific classes: .content, .markdown, .post-content
3. Avoid navigation, sidebars, footers, headers, TOC, breadcrumbs
4. Prefer more specific selectors over generic ones
5. Consider multiple fallback selectors separated by commas"""

ANALYSIS_USER_PROMPT = """Analyze this webpage and identify the main content area.

User's extraction goal: {user_prompt}

HTML Structure:
```html
{html}
```

Return ONLY the JSON object, nothing else."""

REANALYSIS_USER_PROMPT = """The previous configuration failed. Please re-analyze and provide better selectors.

Failure reason: {failure_reason}

Previous configuration that failed:
- css_selector: {old_css_selector}
- excluded_selector: {old_excluded_selector}

Updated HTML Structure:
```html
{html}
```

Provide more robust selectors that handle this page structure. Return ONLY the JSON object."""


class PageAnalyzer:
    def __init__(self, llm_settings: LLMSettings) -> None:
        self._llm = llm_settings
        self._model = llm_settings.provider
        self._api_key = llm_settings.api_key
        self._api_base = llm_settings.base_url or None
        self._temperature = llm_settings.temperature
        self._max_tokens = llm_settings.max_tokens

    async def analyze(
        self,
        html: str,
        user_prompt: str | None = None,
    ) -> AnalysisResult:
        if not self._api_key:
            return self._fallback_analysis(html)

        truncated_html = self._truncate_html(html, max_chars=25000)
        effective_prompt = (
            user_prompt
            or "Extract main document content, excluding navigation, sidebar, footer, and other non-content elements"
        )

        user_message = ANALYSIS_USER_PROMPT.format(
            user_prompt=effective_prompt,
            html=truncated_html,
        )

        try:
            response = await self._call_llm(user_message)
            return self._parse_response(response)
        except Exception as e:
            logger.warning(f"LLM analysis failed: {e}, using fallback")
            return self._fallback_analysis(html)

    async def reanalyze(
        self,
        html: str,
        old_config: SiteConfig,
        failure_reason: str,
    ) -> AnalysisResult:
        if not self._api_key:
            return self._fallback_analysis(html)

        truncated_html = self._truncate_html(html, max_chars=25000)

        user_message = REANALYSIS_USER_PROMPT.format(
            failure_reason=failure_reason,
            old_css_selector=old_config.css_selector or "none",
            old_excluded_selector=old_config.excluded_selector or "none",
            html=truncated_html,
        )

        try:
            response = await self._call_llm(user_message)
            result = self._parse_response(response)
            result.confidence = min(result.confidence, 0.7)
            return result
        except Exception as e:
            logger.warning(f"LLM re-analysis failed: {e}, using fallback")
            return self._fallback_analysis(html)

    async def _call_llm(self, user_message: str) -> str:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "temperature": self._temperature,
            "max_tokens": self._max_tokens,
            "api_key": self._api_key,
        }

        if self._api_base:
            kwargs["api_base"] = self._api_base

        response = completion(**kwargs)
        # litellm returns ModelResponse which has choices but type hints are incomplete
        content: str = response.choices[0].message.content  # pyright: ignore[reportAttributeAccessIssue]
        return content or ""

    def _parse_response(self, response: str) -> AnalysisResult:
        cleaned = response.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            import re

            json_match = re.search(r"\{[^{}]*\}", cleaned, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
            else:
                raise ValueError(
                    f"Could not parse LLM response as JSON: {cleaned[:200]}"
                )

        return AnalysisResult(
            css_selector=data.get("css_selector", "main, article, [role='main']"),
            excluded_selector=data.get(
                "excluded_selector", "nav, aside, footer, header"
            ),
            title_selector=data.get("title_selector", "h1"),
            framework_detected=data.get("framework_detected"),
            confidence=float(data.get("confidence", 0.7)),
            reasoning=data.get("reasoning"),
        )

    def _fallback_analysis(self, html: str) -> AnalysisResult:
        html_lower = html.lower()

        framework_indicators = {
            "docusaurus": ["docusaurus", "theme-doc-markdown", "__docusaurus"],
            "gitbook": ["gitbook", "book-summary"],
            "vuepress": ["vuepress", "theme-default-content"],
            "mkdocs": ["mkdocs", "md-content"],
            "sphinx": ["sphinx", "sphinxsidebar"],
            "readthedocs": ["readthedocs", "rst-content"],
            "confluence": ["confluence", "wiki-content"],
            "notion": ["notion-page-content"],
        }

        detected_framework = None
        for framework, indicators in framework_indicators.items():
            if any(indicator in html_lower for indicator in indicators):
                detected_framework = framework
                break

        if detected_framework and detected_framework in FRAMEWORK_PRESETS:
            preset = FRAMEWORK_PRESETS[detected_framework]
            return AnalysisResult(
                css_selector=preset["css_selector"],
                excluded_selector=preset["excluded_selector"],
                title_selector=preset["title_selector"],
                framework_detected=detected_framework,
                confidence=0.75,
                reasoning=f"Detected {detected_framework} framework via pattern matching",
            )

        generic = FRAMEWORK_PRESETS["generic"]
        return AnalysisResult(
            css_selector=generic["css_selector"],
            excluded_selector=generic["excluded_selector"],
            title_selector=generic["title_selector"],
            framework_detected="generic",
            confidence=0.5,
            reasoning="No specific framework detected, using generic selectors",
        )

    @staticmethod
    def _truncate_html(html: str, max_chars: int = 25000) -> str:
        if len(html) <= max_chars:
            return html

        head_end = html.lower().find("</head>")
        if head_end != -1:
            head_portion = html[: head_end + 7]
            body_start = html.lower().find("<body", head_end)
            if body_start != -1:
                body_content = html[body_start:]
                if len(body_content) > max_chars - len(head_portion):
                    body_content = body_content[: max_chars - len(head_portion)]
                return head_portion + body_content

        return html[:max_chars]
