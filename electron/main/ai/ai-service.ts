import type { AiChatMessage, AiChatParams, AiChatResult, AiMode } from '../../../src/shared/types/ai'
import { aiProviderRequiresApiKey } from '../../../src/shared/types/ai'
import type { AiSettingsStore } from '../store/ai-settings-store'

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

function buildSystemPrompt(mode: AiMode): string {
  switch (mode) {
    case 'explain':
      return [
        '你是 Linux/Unix 运维专家。',
        '用简体中文解释用户提供的命令：作用、参数含义、注意事项。',
        '回答简洁清晰，使用 Markdown 格式。'
      ].join('\n')
    case 'generate':
      return [
        '你是 Linux/Unix 运维专家。',
        '根据用户需求生成可执行的 Shell 命令。',
        '优先给出单条命令；如需多条，用代码块列出。',
        '简要说明命令用途（1-2 句），命令本身放在 ```bash 代码块中。'
      ].join('\n')
    case 'diagnose':
      return [
        '你是 Linux/Unix 运维专家。',
        '分析用户提供的终端错误/日志，用简体中文说明原因并给出排查步骤。',
        '若需要执行命令，放在 ```bash 代码块中。'
      ].join('\n')
    case 'chat':
    default:
      return [
        '你是 YunTerminal 内置的服务器管理 AI 助手。',
        '帮助用户完成 SSH 连接、Linux 运维、Shell 命令、故障排查等任务。',
        '用简体中文回答，必要时给出可执行命令（放在 ```bash 代码块中）。'
      ].join('\n')
  }
}

function buildContextPrompt(context: AiChatParams['context']): string | null {
  if (!context) return null
  const lines: string[] = []
  if (context.connectionName) lines.push(`连接名称: ${context.connectionName}`)
  if (context.host) lines.push(`主机: ${context.host}`)
  if (context.username) lines.push(`用户: ${context.username}`)
  if (context.platform) lines.push(`系统: ${context.platform}`)
  if (context.selectedText) lines.push(`选中内容:\n${context.selectedText}`)
  return lines.length > 0 ? `当前上下文:\n${lines.join('\n')}` : null
}

export class AiService {
  constructor(private readonly settingsStore: AiSettingsStore) {}

  async chat(params: AiChatParams): Promise<AiChatResult> {
    const settings = this.settingsStore.getPublicSettings()
    if (!settings.enabled) {
      return { success: false, message: '请先在设置中启用 AI 助手' }
    }

    const apiKey = this.settingsStore.getApiKey()
    if (aiProviderRequiresApiKey(settings.provider) && !apiKey) {
      return { success: false, message: '请先在设置中配置 API Key' }
    }

    const baseUrl = settings.baseUrl.replace(/\/$/, '')
    const authKey = apiKey ?? 'local'
    const systemParts = [buildSystemPrompt(params.mode)]
    const contextPrompt = buildContextPrompt(params.context)
    if (contextPrompt) systemParts.push(contextPrompt)

    const messages: AiChatMessage[] = [
      { role: 'system', content: systemParts.join('\n\n') },
      ...params.messages.filter((m) => m.role !== 'system')
    ]

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authKey}`
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          temperature: 0.3
        })
      })

      const data = (await response.json()) as ChatCompletionResponse
      if (!response.ok) {
        return {
          success: false,
          message: data.error?.message ?? `API 请求失败 (${response.status})`
        }
      }

      const content = data.choices?.[0]?.message?.content?.trim()
      if (!content) {
        return { success: false, message: 'AI 返回内容为空' }
      }

      return { success: true, content }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'AI 请求失败'
      }
    }
  }
}
