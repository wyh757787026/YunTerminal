const C = {
  reset: '\x1b[0m',
  dim: '\x1b[90m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
} as const

const ANSI_RE = /\x1b\[[0-9;]*m/
const PROMPT_RE = /^[\w.-]+@[\w.-]+:[\w~/$.-]*[$#]\s*$/
const STAT_LINE_RE =
  /^(System load|Usage of \/|Memory usage|Swap usage|Processes|Users logged in|IPv4 address for \S+)/
const BULLET_LINE_RE = /^(\s*\*\s*[^:]+:)\s*(.*)$/

export interface MotdColorState {
  active: boolean
}

function hasAnsi(text: string): boolean {
  return ANSI_RE.test(text)
}

function colorizeUrls(text: string): string {
  return text.replace(/(https?:\/\/\S+)/g, `${C.blue}${C.bold}$1${C.reset}`)
}

function colorizePrompt(line: string): string {
  const match = line.match(/^([\w.-]+@[\w.-]+)(:)([\w~/$.-]*)([$#])(\s*)$/)
  if (!match) return `${C.green}${line}${C.reset}`

  const [, userHost, colon, path, sigil, trailing] = match
  return `${C.green}${userHost}${C.reset}${C.dim}${colon}${C.reset}${C.cyan}${path}${C.reset}${C.yellow}${sigil}${C.reset}${trailing}`
}

function colorizeMotdLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed) return line

  if (/^Welcome to /i.test(trimmed)) {
    return `${C.bold}${C.cyan}${line}${C.reset}`
  }

  if (/^System information as of /i.test(trimmed)) {
    return `${C.bold}${C.yellow}${line}${C.reset}`
  }

  if (/Welcome to Alibaba Cloud/i.test(trimmed)) {
    return `${C.bold}${C.cyan}${line}${C.reset}`
  }

  if (/Expanded Security Maintenance/i.test(trimmed)) {
    return `${C.yellow}${line}${C.reset}`
  }

  if (/\d+\s+updates can be applied/i.test(trimmed)) {
    return `${C.yellow}${line}${C.reset}`
  }

  if (/security updates/i.test(trimmed)) {
    return `${C.red}${line}${C.reset}`
  }

  if (/^Last login:/i.test(trimmed)) {
    return `${C.dim}${line}${C.reset}`
  }

  if (/^To see these additional updates run:/i.test(trimmed)) {
    return line.replace(/(apt list --upgradable)/, `${C.green}${C.bold}$1${C.reset}`)
  }

  if (STAT_LINE_RE.test(trimmed)) {
    const colonIndex = line.indexOf(':')
    if (colonIndex >= 0) {
      const label = line.slice(0, colonIndex + 1)
      const value = line.slice(colonIndex + 1)
      const valueColor = /IPv4 address/i.test(label) ? C.magenta : C.green
      return `${C.dim}${label}${C.reset}${valueColor}${value}${C.reset}`
    }
  }

  const bullet = line.match(BULLET_LINE_RE)
  if (bullet) {
    const [, label, rest] = bullet
    return `${C.cyan}${label}${C.reset} ${colorizeUrls(rest)}`
  }

  if (/https?:\/\//.test(trimmed)) {
    return colorizeUrls(line)
  }

  if (/^\s*\*/.test(trimmed)) {
    return `${C.cyan}${line}${C.reset}`
  }

  return line
}

export function colorizeMotdChunk(chunk: string, state: MotdColorState): string {
  if (!state.active || hasAnsi(chunk)) return chunk

  const normalized = chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const endsWithNewline = normalized.endsWith('\n')

  const colored = lines.map((line, index) => {
    const isLast = index === lines.length - 1
    const candidate = line.trim()

    if (candidate && PROMPT_RE.test(candidate)) {
      state.active = false
      return colorizePrompt(line)
    }

    if (!isLast || endsWithNewline || !candidate) {
      return colorizeMotdLine(line)
    }

    return line
  })

  let result = colored.join('\n')
  if (chunk.includes('\r\n')) {
    result = result.replace(/\n/g, '\r\n')
  } else if (chunk.includes('\r') && !chunk.includes('\n')) {
    result = result.replace(/\n/g, '\r')
  }

  return result
}
