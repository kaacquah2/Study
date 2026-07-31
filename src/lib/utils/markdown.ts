import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Parses markdown text into HTML and sanitizes it using DOMPurify to prevent XSS.
 */
export function renderSanitizedMarkdown(content: string): string {
	if (!content) return '';
	try {
		const rawHtml = marked.parse(content, { async: false }) as string;
		return DOMPurify.sanitize(rawHtml);
	} catch {
		return DOMPurify.sanitize(content);
	}
}

/**
 * Sanitizes raw HTML string using DOMPurify.
 */
export function sanitizeHtml(html: string): string {
	if (!html) return '';
	return DOMPurify.sanitize(html);
}
