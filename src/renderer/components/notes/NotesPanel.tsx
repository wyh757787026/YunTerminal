import { useCallback, useEffect, useRef, useState } from 'react'
import { FilePlus, Pencil, Trash2 } from 'lucide-react'
import type { StoredNote } from '@shared/types/note'
import { renderSimpleMarkdown } from '@renderer/lib/format-utils'
import { useAppStore } from '@renderer/stores/app-store'
import { useSettingsStore } from '@renderer/stores/settings-store'

export function NotesPanel(): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const connectionId = activeSession?.type === 'ssh' ? activeSession.connectionId : undefined

  const {
    noteAutoSave,
    noteAutoSaveIntervalSec,
    noteSyncScroll,
    noteMode,
    noteEditorFontSize
  } = useSettingsStore((s) => s.settings)
  const settingsVersion = useSettingsStore((s) => s.settingsVersion)

  const [notes, setNotes] = useState<StoredNote[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const editorRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const syncingScrollRef = useRef(false)
  const savedSnapshotRef = useRef({ title: '', content: '' })

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null
  const showEditor = noteMode === 'edit' || noteMode === 'split'
  const showPreview = noteMode === 'preview' || noteMode === 'split'

  const loadNotes = useCallback(async (): Promise<void> => {
    if (!connectionId) {
      setNotes([])
      setSelectedId(null)
      setTitle('')
      setContent('')
      return
    }
    const list = await window.api.note.list(connectionId)
    setNotes(list)
  }, [connectionId])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  useEffect(() => {
    if (notes.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !notes.some((n) => n.id === selectedId)) {
      setSelectedId(notes[0].id)
    }
  }, [notes, selectedId])

  useEffect(() => {
    if (selectedNote) {
      setTitle(selectedNote.title)
      setContent(selectedNote.content)
      savedSnapshotRef.current = {
        title: selectedNote.title,
        content: selectedNote.content
      }
    }
  }, [selectedNote?.id])

  const handleSelect = (note: StoredNote): void => {
    setSelectedId(note.id)
    setTitle(note.title)
    setContent(note.content)
    savedSnapshotRef.current = { title: note.title, content: note.content }
  }

  const handleCreate = async (): Promise<void> => {
    if (!connectionId) return
    const note = await window.api.note.create({
      connectionId,
      title: '新笔记',
      content: ''
    })
    await loadNotes()
    handleSelect(note)
  }

  const handleSave = useCallback(async (): Promise<void> => {
    if (!connectionId || !selectedId) return
    setSaving(true)
    try {
      await window.api.note.update(selectedId, { connectionId, title, content })
      savedSnapshotRef.current = { title, content }
      await loadNotes()
    } finally {
      setSaving(false)
    }
  }, [connectionId, selectedId, title, content, loadNotes])

  const handleDelete = async (): Promise<void> => {
    if (!selectedId) return
    if (!confirm('确定删除这条笔记？')) return
    await window.api.note.delete(selectedId)
    setSelectedId(null)
    setTitle('')
    setContent('')
    savedSnapshotRef.current = { title: '', content: '' }
    await loadNotes()
  }

  useEffect(() => {
    if (!noteAutoSave || !selectedId || !connectionId) return

    const dirty =
      title !== savedSnapshotRef.current.title || content !== savedSnapshotRef.current.content
    if (!dirty) return

    const timer = window.setTimeout(() => {
      void handleSave()
    }, noteAutoSaveIntervalSec * 1000)

    return () => window.clearTimeout(timer)
  }, [
    title,
    content,
    selectedId,
    connectionId,
    noteAutoSave,
    noteAutoSaveIntervalSec,
    handleSave
  ])

  const syncScroll = (source: 'editor' | 'preview'): void => {
    if (!noteSyncScroll || noteMode !== 'split') return

    const editor = editorRef.current
    const preview = previewRef.current
    if (!editor || !preview) return

    syncingScrollRef.current = true

    if (source === 'editor') {
      const maxEditor = editor.scrollHeight - editor.clientHeight
      const ratio = maxEditor > 0 ? editor.scrollTop / maxEditor : 0
      const maxPreview = preview.scrollHeight - preview.clientHeight
      preview.scrollTop = ratio * maxPreview
    } else {
      const maxPreview = preview.scrollHeight - preview.clientHeight
      const ratio = maxPreview > 0 ? preview.scrollTop / maxPreview : 0
      const maxEditor = editor.scrollHeight - editor.clientHeight
      editor.scrollTop = ratio * maxEditor
    }

    syncingScrollRef.current = false
  }

  const handleEditorScroll = (): void => {
    if (syncingScrollRef.current) return
    syncScroll('editor')
  }

  const handlePreviewScroll = (): void => {
    if (syncingScrollRef.current) return
    syncScroll('preview')
  }

  if (!connectionId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-accent-muted">
        请先打开一个 SSH 连接以管理笔记
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-44 shrink-0 flex-col border-r border-surface-border">
        <div className="flex items-center justify-between border-b border-surface-border px-2 py-1.5">
          <span className="text-xs text-accent-muted">笔记列表</span>
          <button className="btn-icon h-6 w-6" title="新建笔记" onClick={() => void handleCreate()}>
            <FilePlus size={12} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {notes.length === 0 ? (
            <p className="px-2 py-3 text-[11px] text-accent-muted">暂无笔记</p>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                className={`w-full px-2 py-1.5 text-left text-xs hover:bg-surface-overlay ${
                  note.id === selectedId ? 'bg-surface-overlay text-terminal-fg' : 'text-accent-muted'
                }`}
                onClick={() => handleSelect(note)}
              >
                <div className="truncate font-medium">{note.title}</div>
                <div className="truncate text-[10px] opacity-70">
                  {new Date(note.updatedAt).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {selectedId ? (
          <>
            <div className="flex items-center gap-2 border-b border-surface-border px-2 py-1.5">
              <input
                className="input min-w-0 flex-1 text-xs"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="笔记标题"
              />
              {noteAutoSave ? (
                <span className="shrink-0 text-[10px] text-accent-muted">
                  {saving ? '保存中…' : '自动保存'}
                </span>
              ) : (
                <button
                  className="btn-secondary px-2 py-1 text-[11px]"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? '保存中' : '保存'}
                </button>
              )}
              <button className="btn-icon h-6 w-6 text-red-400" onClick={() => void handleDelete()}>
                <Trash2 size={12} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1" key={`${selectedId}-${settingsVersion}`}>
              {showEditor && (
                <textarea
                  ref={editorRef}
                  className={`min-h-0 resize-none bg-transparent p-3 font-mono leading-relaxed text-terminal-fg outline-none ${
                    noteMode === 'split'
                      ? 'w-1/2 border-r border-surface-border'
                      : 'w-full flex-1'
                  }`}
                  style={{ fontSize: noteEditorFontSize }}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onScroll={handleEditorScroll}
                  placeholder="支持 Markdown：# 标题、**粗体**、`代码`"
                />
              )}
              {showPreview && (
                <div
                  ref={previewRef}
                  className={`min-h-0 overflow-auto p-3 leading-relaxed text-terminal-fg ${
                    noteMode === 'split' ? 'w-1/2' : 'w-full flex-1'
                  }`}
                  style={{ fontSize: noteEditorFontSize }}
                  onScroll={handlePreviewScroll}
                  dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(content) }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-accent-muted">
            <Pencil size={20} className="opacity-40" />
            <span>选择或新建一条笔记</span>
          </div>
        )}
      </div>
    </div>
  )
}
