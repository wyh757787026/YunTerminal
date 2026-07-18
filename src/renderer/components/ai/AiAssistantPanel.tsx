import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Send, Terminal, X } from 'lucide-react'
import type { AiChatMessage, AiMode } from '@shared/types/ai'
import { AI_MODE_LABELS } from '@shared/types/ai'
import { extractExecutableCommand } from '@renderer/lib/ai-utils'
import { renderSimpleMarkdown } from '@renderer/lib/format-utils'
import { getActiveTerminal } from '@renderer/lib/session-utils'
import { useAppStore } from '@renderer/stores/app-store'

const MODE_PLACEHOLDERS: Record<AiMode, string> = {
  chat: '问我任何服务器管理相关的问题…',
  explain: '粘贴需要解释的命令，例如：tar -czvf backup.tar.gz /var/log',
  generate: '描述你想完成的任务，例如：查找占用磁盘最大的 10 个目录',
  diagnose: '粘贴终端报错信息…'
}

interface ChatItem extends AiChatMessage {
  id: string
}

export function AiAssistantPanel(): React.JSX.Element {
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const connections = useAppStore((s) => s.connections)
  const sendQuickCommand = useAppStore((s) => s.sendQuickCommand)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeTerminal = getActiveTerminal(activeSession)
  const connection =
    activeSession?.type === 'ssh'
      ? connections.find((c) => c.id === activeSession.connectionId)
      : undefined

  const [mode, setMode] = useState<AiMode>('chat')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const loadSettings = useCallback(async (): Promise<void> => {
    const settings = await window.api.ai.getSettings()
    setConfigured(settings.enabled && settings.apiKeyConfigured)
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, loading])

  const handleSend = async (): Promise<void> => {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: ChatItem = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text
    }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const result = await window.api.ai.chat({
        mode,
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        context: connection
          ? {
              connectionName: connection.name,
              host: connection.host,
              username: connection.username
            }
          : undefined
      })

      if (!result.success || !result.content) {
        setError(result.message ?? 'AI 请求失败')
        return
      }

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: result.content! }
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 请求失败')
    } finally {
      setLoading(false)
    }
  }

  const insertToTerminal = (content: string): void => {
    if (!activeSessionId || activeSession?.type !== 'ssh' || !activeTerminal) return
    const command = extractExecutableCommand(content)
    if (!command) return
    sendQuickCommand(activeTerminal.id, command)
  }

  return (
    <div className="panel-card flex w-[340px] shrink-0 flex-col">
      <div className="flex h-10 items-center justify-between border-b border-surface-border/40 px-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <div className="flex h-6 w-6 items-center justify-center rounded-card bg-accent-soft">
            <Bot size={13} className="text-accent" />
          </div>
          AI 助手
        </div>
        <button className="btn-icon-sm" onClick={toggleAiPanel}>
          <X size={12} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-surface-border/40 p-2">
        {(Object.keys(AI_MODE_LABELS) as AiMode[]).map((item) => (
          <button
            key={item}
            className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
              mode === item
                ? 'bg-accent-soft text-accent'
                : 'text-accent-muted hover:bg-surface-overlay/60 hover:text-terminal-fg'
            }`}
            onClick={() => setMode(item)}
          >
            {AI_MODE_LABELS[item]}
          </button>
        ))}
      </div>

      {!configured && (
        <div className="banner-warning">
          请先在设置 → AI 助手中启用并配置 API Key
        </div>
      )}

      {connection && (
        <div className="border-b border-surface-border px-3 py-1.5 text-[11px] text-accent-muted">
          上下文：{connection.name} ({connection.username}@{connection.host})
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-accent-muted">
            <Bot size={24} className="opacity-30" />
            <p>选择模式后输入问题</p>
            <p className="opacity-70">支持 OpenAI 及兼容 API</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-md px-3 py-2 text-xs ${
                msg.role === 'user'
                  ? 'ml-6 bg-accent/20 text-terminal-fg'
                  : 'mr-2 bg-surface-overlay text-terminal-fg'
              }`}
            >
              <div className="leading-relaxed">
                {msg.role === 'assistant' ? (
                  <div dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(msg.content) }} />
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
              {msg.role === 'assistant' && activeSession?.type === 'ssh' && (
                <button
                  className="mt-2 flex items-center gap-1 text-[11px] text-accent hover:underline"
                  onClick={() => insertToTerminal(msg.content)}
                >
                  <Terminal size={10} />
                  插入终端
                </button>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="text-xs text-accent-muted">思考中…</div>
        )}
      </div>

      {error && (
        <div className="border-t border-surface-border bg-red-500/10 px-3 py-1.5 text-[11px] text-red-400">
          {error}
        </div>
      )}

      <div className="border-t border-surface-border p-2">
        <div className="flex gap-2">
          <textarea
            className="input min-h-16 flex-1 resize-none text-xs"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={MODE_PLACEHOLDERS[mode]}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          <button
            className="btn-primary flex h-16 w-10 shrink-0 items-center justify-center"
            disabled={loading || !input.trim()}
            onClick={() => void handleSend()}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
