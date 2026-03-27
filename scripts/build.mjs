import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const outDir = path.join(rootDir, 'dist');

async function collectTsFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectTsFiles(entryPath);
      }
      if (entry.isFile() && entry.name.endsWith('.ts')) {
        return [entryPath];
      }
      return [];
    }),
  );

  return files.flat();
}

function rewriteImports(code) {
  return code
    .replace(/(from\s+['"])(\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1$2.js$3')
    .replace(/(import\(\s*['"])(\.{1,2}\/[^'"]+)\.ts(['"]\s*\))/g, '$1$2.js$3');
}

async function buildFile(filePath) {
  const relativePath = path.relative(srcDir, filePath);
  const outPath = path.join(outDir, relativePath.replace(/\.ts$/, '.js'));
  const source = await fs.readFile(filePath, 'utf8');
  const transformed = stripTypeScriptTypes(source, {
    mode: 'transform',
    sourceUrl: relativePath.replace(/\\/g, '/'),
  });
  const output = rewriteImports(transformed);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, output, 'utf8');
}

async function main() {
  const files = await collectTsFiles(srcDir);
  await Promise.all(files.map(buildFile));
  console.log(`Built ${files.length} TypeScript files into dist/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
