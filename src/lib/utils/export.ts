import type { CourseDoc, ModuleDoc } from '$lib/firebase/converters';

/**
 * Formats course overview and modules into a structured Markdown string.
 */
export function generateCourseMarkdown(course: CourseDoc, modules: ModuleDoc[]): string {
	let md = `# ${course.title}\n\n`;
	if (course.description) {
		md += `> ${course.description}\n\n`;
	}

	md += `**Level:** ${course.level || 'N/A'}  \n`;
	md += `**Estimated Duration:** ${course.estimatedMinutes || 45} mins  \n`;
	if (course.tags && course.tags.length > 0) {
		md += `**Tags:** ${course.tags.map((t) => `#${t}`).join(', ')}  \n`;
	}
	md += `\n---\n\n## Table of Contents\n\n`;

	modules.forEach((mod, idx) => {
		md += `${idx + 1}. [${mod.title}](#module-${idx + 1})\n`;
	});

	md += `\n---\n\n`;

	modules.forEach((mod, idx) => {
		md += `<a id="module-${idx + 1}"></a>\n`;
		md += `### Module ${idx + 1}: ${mod.title}\n\n`;
		if (mod.summary) {
			md += `*${mod.summary}*\n\n`;
		}

		if (mod.pages && mod.pages.length > 0) {
			mod.pages.forEach((page) => {
				md += `#### ${page.heading}\n\n`;
				if (page.subheading) {
					md += `*${page.subheading}*\n\n`;
				}
				md += `${page.body}\n\n`;
			});
		} else if (mod.type === 'lesson') {
			md += `*(Lesson content pending generation)*\n\n`;
		}

		if (mod.questions && mod.questions.length > 0) {
			md += `#### Module Quiz Questions\n\n`;
			mod.questions.forEach((q, qIdx) => {
				md += `**Q${qIdx + 1}: ${q.question}**\n`;
				q.options.forEach((opt, oIdx) => {
					const isCorrect = oIdx === q.answerIndex ? ' ✓ (Correct)' : '';
					md += `- ${opt}${isCorrect}\n`;
				});
				if (q.explanation) {
					md += `*Explanation:* ${q.explanation}\n`;
				}
				md += `\n`;
			});
		}

		md += `---\n\n`;
	});

	return md;
}

/**
 * Generates an Anki-compatible TSV string formatted with Anki file headers.
 */
export function generateAnkiCardsTSV(course: CourseDoc, modules: ModuleDoc[]): string {
	let tsv = `#separator:tab\n#html:true\n#tags column:4\n#columns:Front\tBack\tExplanation\tTags\n`;

	const courseTag = (course.title || 'study')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

	modules.forEach((mod) => {
		const modTag = (mod.title || 'module')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');
		const tags = `${courseTag} ${modTag}`;

		if (mod.questions && mod.questions.length > 0) {
			mod.questions.forEach((q) => {
				const front = (q.question || q.prompt || '').trim().replace(/\t/g, ' ');
				const correctIdx = q.answerIndex ?? q.correctIndex ?? 0;
				const correctOpt = q.options?.[correctIdx] || '';
				const back = `<b>${correctOpt}</b>`;
				const explanation = (q.explanation || '').trim().replace(/\t/g, ' ');

				tsv += `${front}\t${back}\t${explanation}\t${tags}\n`;
			});
		}
	});

	return tsv;
}

/**
 * Downloads Anki Flashcards Deck (.txt tab-separated format for direct Anki File -> Import).
 */
export function downloadAnkiDeck(course: CourseDoc, modules: ModuleDoc[]) {
	const tsv = generateAnkiCardsTSV(course, modules);
	const sanitizeTitle = (course.title || 'anki-deck').toLowerCase().replace(/[^a-z0-9]+/g, '-');
	downloadFile(`${sanitizeTitle}-anki-deck.txt`, tsv, 'text/plain;charset=utf-8;');
}

/**
 * Triggers a browser file download for a text blob.
 */
export function downloadFile(
	filename: string,
	content: string,
	contentType: string = 'text/markdown;charset=utf-8;'
) {
	const blob = new Blob([content], { type: contentType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Triggers browser print dialog formatted for saving as PDF or printing.
 */
export function printCourse(course: CourseDoc, modules: ModuleDoc[]) {
	const mdContent = generateCourseMarkdown(course, modules);
	const printWindow = window.open('', '_blank');
	if (!printWindow) {
		const sanitizeTitle = (course.title || 'course').toLowerCase().replace(/[^a-z0-9]+/g, '-');
		downloadFile(`${sanitizeTitle}-print.md`, mdContent);
		return;
	}

	const modulesHTML = modules
		.map((mod, idx) => {
			let pagesHTML = '';
			if (mod.pages && mod.pages.length > 0) {
				pagesHTML = mod.pages
					.map(
						(p) => `
					<div class="page-block">
						<h4>${p.heading}</h4>
						${p.subheading ? `<h5>${p.subheading}</h5>` : ''}
						<div class="body-text">${p.body.replace(/\n/g, '<br/>')}</div>
					</div>
				`
					)
					.join('');
			}

			let questionsHTML = '';
			if (mod.questions && mod.questions.length > 0) {
				questionsHTML = `
				<div class="quiz-block">
					<h4>Module Review Quiz</h4>
					${mod.questions
						.map((q, qIdx) => {
							const correctIdx = q.answerIndex ?? q.correctIndex ?? 0;
							return `
							<div class="question-item">
								<p><strong>Q${qIdx + 1}:</strong> ${q.question || q.prompt || ''}</p>
								<ul>
									${q.options
										.map(
											(opt, oIdx) =>
												`<li class="${oIdx === correctIdx ? 'correct' : ''}">${opt} ${oIdx === correctIdx ? '✓' : ''}</li>`
										)
										.join('')}
								</ul>
								${q.explanation ? `<p class="explanation"><em>Explanation:</em> ${q.explanation}</p>` : ''}
							</div>
						`;
						})
						.join('')}
				</div>
			`;
			}

			return `
			<section class="module-section">
				<h2>Module ${idx + 1}: ${mod.title}</h2>
				${mod.summary ? `<p class="summary">${mod.summary}</p>` : ''}
				${pagesHTML}
				${questionsHTML}
			</section>
		`;
		})
		.join('');

	printWindow.document.write(`
		<!DOCTYPE html>
		<html>
		<head>
			<title>${course.title} - Study Guide</title>
			<style>
				@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
				body { font-family: 'Inter', system-ui, sans-serif; line-height: 1.6; color: #0f172a; max-width: 800px; margin: 2rem auto; padding: 0 1.5rem; }
				h1 { color: #0f172a; border-bottom: 3px solid #3b82f6; padding-bottom: 0.5rem; font-size: 2rem; margin-bottom: 0.5rem; }
				h2 { color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3rem; margin-top: 2rem; font-size: 1.4rem; page-break-before: always; }
				h3, h4 { color: #334155; margin-top: 1.2rem; margin-bottom: 0.4rem; }
				.meta { font-size: 0.85rem; color: #64748b; margin-bottom: 1.5rem; }
				.summary { font-style: italic; color: #475569; background: #f8fafc; border-left: 4px solid #3b82f6; padding: 0.5rem 1rem; margin-bottom: 1.5rem; }
				.page-block { margin-bottom: 1.5rem; }
				.correct { font-weight: 600; color: #16a34a; }
				.explanation { font-size: 0.85rem; color: #475569; background: #f1f5f9; padding: 0.4rem 0.8rem; border-radius: 6px; }
				ul { padding-left: 1.2rem; }
				li { margin-bottom: 0.2rem; }
				@media print {
					body { max-width: 100%; margin: 0; padding: 0; }
					.module-section { page-break-after: always; }
				}
			</style>
		</head>
		<body>
			<h1>${course.title}</h1>
			<div class="meta">
				<p>${course.description || ''}</p>
				<p><strong>Level:</strong> ${course.level || 'General'} | <strong>Duration:</strong> ${course.estimatedMinutes || 45} mins</p>
			</div>
			${modulesHTML}
			<script>
				window.onload = function() { window.print(); };
			</script>
		</body>
		</html>
	`);
	printWindow.document.close();
}
