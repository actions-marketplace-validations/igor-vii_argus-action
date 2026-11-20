import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/index.js',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  external: [],
});
console.log('built dist/index.js');
