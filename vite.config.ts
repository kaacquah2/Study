import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			}
		})
	],
	server: {
		watch: {
			ignored: ['**/.venv/**', '**/ml_backend/**']
		}
	},
	build: {
		chunkSizeWarningLimit: 1000
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/lib/firebase/rules.test.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'rules',
					environment: 'node',
					include: ['src/lib/firebase/rules.test.ts']
				}
			}
		]
	}
});
