"""Content validation for crawled pages."""

import re

from app.models import ValidationResult, ValidationStatus
from app.settings_loader import AdaptiveSettings


class ContentValidator:
    def __init__(self, adaptive_settings: AdaptiveSettings) -> None:
        self._min_content_length = adaptive_settings.min_content_length
        self._min_word_count = adaptive_settings.min_word_count

    def validate(self, content: str | None) -> ValidationResult:
        if not content or not content.strip():
            return ValidationResult(
                status=ValidationStatus.EMPTY,
                message="Extracted content is empty",
                content_length=0,
                word_count=0,
            )

        clean_content = content.strip()
        content_length = len(clean_content)
        word_count = len(clean_content.split())

        if content_length < self._min_content_length:
            return ValidationResult(
                status=ValidationStatus.TOO_SHORT,
                message=f"Content too short: {content_length} chars (min: {self._min_content_length})",
                content_length=content_length,
                word_count=word_count,
            )

        if word_count < self._min_word_count:
            return ValidationResult(
                status=ValidationStatus.TOO_SHORT,
                message=f"Word count too low: {word_count} words (min: {self._min_word_count})",
                content_length=content_length,
                word_count=word_count,
            )

        if self._is_navigation_content(clean_content):
            return ValidationResult(
                status=ValidationStatus.LOW_QUALITY,
                message="Content appears to be navigation/menu items only",
                content_length=content_length,
                word_count=word_count,
            )

        return ValidationResult(
            status=ValidationStatus.OK,
            message="Content validation passed",
            content_length=content_length,
            word_count=word_count,
        )

    def _is_navigation_content(self, content: str) -> bool:
        lines = [line.strip() for line in content.split("\n") if line.strip()]

        if len(lines) < 5:
            return False

        short_lines = sum(1 for line in lines if len(line) < 40)
        short_line_ratio = short_lines / len(lines)

        if short_line_ratio > 0.85:
            return True

        link_pattern = re.compile(r"^\[.*?\]\(.*?\)$|^[-*]\s*\[.*?\]|^#+\s*$")
        link_like_lines = sum(1 for line in lines if link_pattern.match(line))
        link_ratio = link_like_lines / len(lines)

        if link_ratio > 0.7:
            return True

        unique_words = set(content.lower().split())
        total_words = len(content.split())
        if total_words > 20:
            uniqueness_ratio = len(unique_words) / total_words
            if uniqueness_ratio < 0.3:
                return True

        return False

    def get_failure_reason(self, validation: ValidationResult) -> str:
        if validation.status == ValidationStatus.EMPTY:
            return "No content extracted - selector may not match any elements"
        if validation.status == ValidationStatus.TOO_SHORT:
            return f"Content too short ({validation.content_length} chars, {validation.word_count} words) - selector may be too restrictive"
        if validation.status == ValidationStatus.LOW_QUALITY:
            return "Extracted content appears to be navigation/boilerplate - selector may target wrong area"
        if validation.status == ValidationStatus.SELECTOR_NOT_FOUND:
            return "CSS selector did not match any elements on the page"
        return validation.message
