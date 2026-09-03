import { describe, it, expect } from 'vitest';
import DOMPurify from 'isomorphic-dompurify';

describe('MermaidDiagram SVG Security & Sanitization', () => {
	it('strips malicious <script> tags from SVG output', () => {
		const maliciousSvg = `<svg viewBox="0 0 100 100"><script>alert("xss")</script><circle cx="50" cy="50" r="40"/></svg>`;
		const sanitized = DOMPurify.sanitize(maliciousSvg, {
			USE_PROFILES: { svg: true, svgFilters: true }
		});

		expect(sanitized).not.toContain('<script');
		expect(sanitized).not.toContain('alert("xss")');
		expect(sanitized).toContain('<circle');
	});

	it('strips inline JavaScript event handlers from SVG elements', () => {
		const maliciousSvg = `<svg><rect width="100" height="100" onload="alert('xss')" onerror="alert('xss')"/></svg>`;
		const sanitized = DOMPurify.sanitize(maliciousSvg, {
			USE_PROFILES: { svg: true, svgFilters: true }
		});

		expect(sanitized).not.toContain('onload');
		expect(sanitized).not.toContain('onerror');
		expect(sanitized).toContain('<rect');
	});

	it('strips javascript: pseudo-protocol URIs inside SVG links', () => {
		const maliciousSvg = `<svg><a href="javascript:alert(document.cookie)"><text>Click</text></a></svg>`;
		const sanitized = DOMPurify.sanitize(maliciousSvg, {
			USE_PROFILES: { svg: true, svgFilters: true }
		});

		expect(sanitized).not.toContain('javascript:');
	});
});
