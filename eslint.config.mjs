import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
const config = [
  { ignores: ['.next/**','node_modules/**','.private/**','dist/**','out/**'] },
  ...nextVitals,
  ...nextTypescript,
  { rules: {
    'react-hooks/exhaustive-deps': 'error',
    'react-hooks/set-state-in-effect': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    'prefer-spread': 'error'
  } }
];
export default config;
