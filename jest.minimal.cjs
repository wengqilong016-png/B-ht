const path = require('path');

module.exports = {
  rootDir: '/root/workspace/bht',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: [],
  transform: {
    '^.+\\.tsx?$': [path.join('/root/workspace/bht', 'jest.vite-transform.cjs')],
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': path.join('/root/workspace/bht', 'node_modules/identity-obj-proxy/src/index.js'),
    '^@/(.*)$': '/root/workspace/bht/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '__tests__/helpers/',
  ],
};
