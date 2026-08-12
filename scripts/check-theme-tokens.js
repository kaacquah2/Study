import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

function getAllSvelteFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir);
	for (const file of files) {
		const filePath = path.join(dir, file);
		if (fs.statSync(filePath).isDirectory()) {
			getAllSvelteFiles(filePath, fileList);
		} else if (file.endsWith('.svelte')) {
			fileList.push(filePath);
		}
	}
	return fileList;
}

const svelteFiles = getAllSvelteFiles(srcDir);
let totalWarnings = 0;

console.log('🔍 Running Advisory Theme-Token Audit on Svelte components...\n');

// Classes that are suspect if used without dark: override or theme wrapper
const suspectPattern = /(?<!dark:)(?:bg|text|border)-(?:white|black)(?![/\w])/g;

for (const filePath of svelteFiles) {
	const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
	const content = fs.readFileSync(filePath, 'utf8');
	const lines = content.split('\n');

	lines.forEach((line, idx) => {
		// Ignore SVG paths, comments, and explicit overlay/scrim/badge exceptions
		if (
			line.includes('<path') ||
			line.includes('backdrop') ||
			line.includes('scrim') ||
			line.includes('gradient')
		) {
			return;
		}

		let match;
		while ((match = suspectPattern.exec(line)) !== null) {
			console.warn(
				`\x1b[33m⚠️  [Advisory]\x1b[0m ${relativePath}:${idx + 1} — Found '${match[0]}'. Consider checking dark mode compatibility or using theme token.`
			);
			totalWarnings++;
		}
	});
}

console.log(`\n✅ Advisory Theme-Token Audit finished with ${totalWarnings} advisory note(s).`);
