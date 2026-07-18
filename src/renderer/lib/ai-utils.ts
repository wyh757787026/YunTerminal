export function extractExecutableCommand(content: string): string | null {
  const codeBlock = content.match(/```(?:bash|sh|shell)?\s*\n([\s\S]*?)```/i)
  if (codeBlock?.[1]) {
    const line = codeBlock[1]
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'))
    if (line) return line
  }

  const line = content
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('`'))
  return line ?? null
}
