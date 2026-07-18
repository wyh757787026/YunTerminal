export type AiProvider = 'openai' | 'ollama' | 'llama' | 'custom'
export type AiMode = 'chat' | 'explain' | 'generate' | 'diagnose'

export interface AiPublicSettings {
  enabled: boolean
  provider: AiProvider
  baseUrl: string
  model: string
  apiKeyConfigured: boolean
}

export interface AiSettingsInput {
  enabled?: boolean
  provider?: AiProvider
  baseUrl?: string
  model?: string
  apiKey?: string
}

export type AiMessageRole = 'user' | 'assistant' | 'system'

export interface AiChatMessage {
  role: AiMessageRole
  content: string
}

export interface AiContext {
  connectionName?: string
  host?: string
  username?: string
  platform?: string
  selectedText?: string
}

export interface AiChatParams {
  mode: AiMode
  messages: AiChatMessage[]
  context?: AiContext
}

export interface AiChatResult {
  success: boolean
  content?: string
  message?: string
}

export const DEFAULT_AI_SETTINGS: AiPublicSettings = {
  enabled: false,
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyConfigured: false
}

export interface AiProviderOption {
  id: AiProvider
  label: string
  baseUrl: string
  defaultModel: string
}

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'llama3.2'
  },
  {
    id: 'llama',
    label: 'Llama',
    baseUrl: 'http://127.0.0.1:8080/v1',
    defaultModel: 'llama-3.2-3b-instruct'
  },
  {
    id: 'custom',
    label: '自定义（兼容 OpenAI API）',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini'
  }
]

export function aiProviderRequiresApiKey(provider: AiProvider): boolean {
  switch (provider) {
    case 'ollama':
    case 'llama':
      return false
    case 'openai':
    case 'custom':
      return true
    default: {
      const _exhaustive: never = provider
      return _exhaustive
    }
  }
}

export const AI_MODE_LABELS: Record<AiMode, string> = {
  chat: '对话',
  explain: '解释命令',
  generate: '生成命令',
  diagnose: '诊断错误'
}
