import { ESLint } from 'eslint'

export async function lintText(code: string, filename: string): Promise<ESLint.LintResult[]> {
  const eslint = new ESLint({ useEslintrc: true })
  return eslint.lintText(code, { filePath: filename })
}
