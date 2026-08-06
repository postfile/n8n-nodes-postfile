const { n8nCommunityNodesPlugin } = require('@n8n/eslint-plugin-community-nodes');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
	n8nCommunityNodesPlugin.configs.recommended,
	{
		rules: { 'no-console': 'error' },
	},
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsParser,
		},
	},
	{
		ignores: ['node_modules/**', 'dist/**'],
	},
];
