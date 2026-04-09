/**
 * jest.vite-transform.cjs
 *
 * A thin Jest transform wrapper that replaces Vite-specific `import.meta.env.*`
 * references with `process.env.*` equivalents before handing the source to
 * ts-jest for TypeScript compilation.  This lets us test modules that use
 * Vite's build-time env substitution in the Jest (CommonJS) environment.
 */
'use strict';

const { TsJestTransformer } = require('ts-jest');

const transformer = new TsJestTransformer({
  tsconfig: {
    jsx: 'react-jsx',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    rootDir: '.',
    moduleResolution: 'node',
    ignoreDeprecations: '6.0',
  },
});

function preprocessViteEnv(sourceText) {
  return sourceText
    .replace(/import\.meta\.env\.VITE_([A-Z0-9_]+)/g, (_match, key) => `process.env.VITE_${key}`)
    .replace(/import\.meta\.env\.DEV\b/g, "(process.env.NODE_ENV !== 'production')")
    .replace(/import\.meta\.env\.PROD\b/g, "(process.env.NODE_ENV === 'production')")
    .replace(/import\.meta\.env\.MODE\b/g, "(process.env.NODE_ENV ?? 'test')");
}

module.exports = {
  process(sourceText, sourcePath, options) {
    const preprocessed = preprocessViteEnv(sourceText);
    return transformer.process(preprocessed, sourcePath, options);
  },
  getCacheKey(sourceText, sourcePath, options) {
    const preprocessed = preprocessViteEnv(sourceText);
    return transformer.getCacheKey(preprocessed, sourcePath, options);
  },
};
