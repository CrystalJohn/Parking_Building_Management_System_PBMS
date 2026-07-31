module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/*.spec.ts'],
      transform: {
        '^.+\\.ts$': [require.resolve('./jest.transform.cjs'), {}],
      },
      moduleFileExtensions: ['ts', 'js', 'json'],
    },
    {
      displayName: 'dom',
      testEnvironment: 'jsdom',
      testMatch: ['**/*.test.tsx'],
      transform: {
        '^.+\\.tsx?$': [require.resolve('./jest.transform.cjs'), {}],
      },
      moduleFileExtensions: ['tsx', 'ts', 'js', 'json'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  ],
}
