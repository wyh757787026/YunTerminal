import type { ProtocolTab } from '@renderer/stores/app-store'
import { useAppStore } from '@renderer/stores/app-store'

const PROTOCOL_TABS: { id: ProtocolTab; label: string; enabled: boolean }[] = [
  { id: 'ssh', label: 'SSH', enabled: true },
  { id: 'rdp', label: 'RDP', enabled: true },
  { id: 'telnet', label: 'Telnet', enabled: true },
  { id: 'ftp', label: 'FTP', enabled: true }
]

export function ConnectionProtocolNav(): React.JSX.Element {
  const { protocolTab, setProtocolTab, openBottomPanel } = useAppStore()

  const handleTabClick = (tab: ProtocolTab, enabled: boolean): void => {
    if (!enabled) return
    setProtocolTab(tab)
    if (tab === 'tunnel') {
      openBottomPanel('tunnel')
    }
  }

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-surface-border/50 px-3">
      <div className="flex items-center gap-1">
        {PROTOCOL_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`protocol-tab ${protocolTab === tab.id ? 'protocol-tab-active' : ''} ${!tab.enabled ? 'opacity-40' : ''}`}
            disabled={!tab.enabled}
            title={tab.enabled ? undefined : '即将支持'}
            onClick={() => handleTabClick(tab.id, tab.enabled)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
