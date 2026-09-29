// Pin a negative UTC offset so local-vs-UTC date mixups (cell dates are
// UTC-midnight) surface as failures on any machine. Must be set before any
// Date/Intl use — changing TZ mid-run is not reliably picked up under Jest.
process.env.TZ = 'America/Los_Angeles';

module.exports = {
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	moduleNameMapper: {
		'^obsidian$': '<rootDir>/__mocks__/obsidian.ts',
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
	},
};
