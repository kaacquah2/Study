import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Progressive Web App (PWA) Configuration', () => {
	const rootDir = process.cwd();
	const staticDir = path.join(rootDir, 'static');
	const manifestPath = path.join(staticDir, 'manifest.json');
	const swPath = path.join(staticDir, 'sw.js');
	const appHtmlPath = path.join(rootDir, 'src', 'app.html');
	const layoutPath = path.join(rootDir, 'src', 'routes', '+layout.svelte');

	it('static/manifest.json exists and adheres to W3C Web App Manifest specification', () => {
		expect(fs.existsSync(manifestPath)).toBe(true);

		const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
		const manifest = JSON.parse(manifestRaw);

		expect(manifest.name).toBe('AI Study Buddy');
		expect(manifest.short_name).toBeTruthy();
		expect(manifest.start_url).toBeTruthy();
		expect(manifest.display).toBe('standalone');
		expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
		expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);

		expect(Array.isArray(manifest.icons)).toBe(true);
		expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

		// Ensure 192x192 and 512x512 icons are individually defined
		const icon192 = manifest.icons.find((icon: { sizes?: string }) => icon.sizes === '192x192');
		const icon512 = manifest.icons.find((icon: { sizes?: string }) => icon.sizes === '512x512');

		expect(icon192).toBeDefined();
		expect(icon512).toBeDefined();
		expect(icon192.src).toBeTruthy();
		expect(icon512.src).toBeTruthy();

		// Ensure every icon declared in manifest exists in static/
		for (const icon of manifest.icons) {
			const relativePath = icon.src.replace(/^\//, '');
			const fullPath = path.join(staticDir, relativePath);
			expect(fs.existsSync(fullPath), `Icon file ${icon.src} must exist in static/`).toBe(true);
			const stat = fs.statSync(fullPath);
			expect(stat.size).toBeGreaterThan(0);
		}
	});

	it('static/sw.js caches existing assets without 404 rejections', () => {
		expect(fs.existsSync(swPath)).toBe(true);
		const swContent = fs.readFileSync(swPath, 'utf-8');

		// Match ASSETS array
		const assetsMatch = swContent.match(/const ASSETS = \[([\s\S]*?)\];/);
		expect(assetsMatch).toBeTruthy();

		const assetStrings = assetsMatch![1]
			.split(',')
			.map((s) => s.trim().replace(/['"]/g, ''))
			.filter(Boolean);

		expect(assetStrings).toContain('/manifest.json');
		expect(assetStrings).toContain('/favicon.png');
		expect(assetStrings).toContain('/icon-192.png');
		expect(assetStrings).toContain('/icon-512.png');

		// For file assets (containing a dot), ensure they exist in static/
		for (const asset of assetStrings) {
			if (asset.includes('.')) {
				const relativePath = asset.replace(/^\//, '');
				const fullPath = path.join(staticDir, relativePath);
				expect(
					fs.existsSync(fullPath),
					`Asset ${asset} referenced in sw.js must exist in static/`
				).toBe(true);
			}
		}
	});

	it('src/app.html links the web app manifest and specifies theme-color meta tag', () => {
		expect(fs.existsSync(appHtmlPath)).toBe(true);
		const appHtml = fs.readFileSync(appHtmlPath, 'utf-8');

		expect(appHtml).toContain('<link rel="manifest" href="/manifest.json"');
		expect(appHtml).toContain('<meta name="theme-color"');
	});

	it('src/routes/+layout.svelte registers the service worker upon browser mount', () => {
		expect(fs.existsSync(layoutPath)).toBe(true);
		const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

		expect(layoutContent).toContain('serviceWorker');
		expect(layoutContent).toContain('.register(');
	});
});
