// Dev-only: serves compiled TypeScript and SCSS from memory via esbuild.
// For production builds use: npm run build && npm run build:css
import * as esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';

const ctx = await esbuild.context({
	entryPoints: {
		edit:  'editor/index.ts',
		style: 'scss/style.scss',
	},
	bundle:   true,
	outdir:   '/tmp',
	platform: 'browser',
	target:   'es2022',
	define:   { DEBUG: 'true' },
	plugins:  [sassPlugin()],
});

await ctx.serve({ host: '0.0.0.0', port: 9001 });
