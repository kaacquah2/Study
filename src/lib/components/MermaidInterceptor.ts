import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

export interface InterceptedMermaidResult {
	sections: Array<
		{ type: 'html'; content: string } | { type: 'mermaid'; id: string; code: string }
	>;
}

/**
 * Intercepts fenced ````mermaid` blocks in markdown text, cleans & sanitizes HTML,
 * and produces structured sections for rendering in Svelte.
 */
export function interceptMermaidBlocks(rawMarkdown: string): InterceptedMermaidResult {
	if (!rawMarkdown) {
		return { sections: [] };
	}

	const mermaidRegex = /```mermaid\s*\n([\s\S]*?)\n```/gi;

	const sections: InterceptedMermaidResult['sections'] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	let count = 0;

	while ((match = mermaidRegex.exec(rawMarkdown)) !== null) {
		const textBefore = rawMarkdown.substring(lastIndex, match.index);
		if (textBefore.trim()) {
			const sanitizedHtml = DOMPurify.sanitize(marked.parse(textBefore) as string);
			if (sanitizedHtml.trim()) {
				sections.push({ type: 'html', content: sanitizedHtml });
			}
		}

		const mermaidCode = match[1].trim();
		const diagramId = `mermaid-intercepted-${count++}-${Math.random().toString(36).substring(2, 7)}`;
		sections.push({ type: 'mermaid', id: diagramId, code: mermaidCode });

		lastIndex = mermaidRegex.lastIndex;
	}

	const textAfter = rawMarkdown.substring(lastIndex);
	if (textAfter.trim()) {
		const sanitizedHtml = DOMPurify.sanitize(marked.parse(textAfter) as string);
		if (sanitizedHtml.trim()) {
			sections.push({ type: 'html', content: sanitizedHtml });
		}
	}

	return { sections };
}
