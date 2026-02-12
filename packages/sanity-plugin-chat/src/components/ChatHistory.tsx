import {useState} from 'react'
import {Box, Button, Card, Stack, Text} from '@sanity/ui'

// Inline SVG icons to avoid @sanity/icons dependency resolution issues
function MenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 25 25" fill="none" stroke="currentColor" strokeWidth="1.2">
      <line x1="5" y1="8" x2="20" y2="8" /><line x1="5" y1="12.5" x2="20" y2="12.5" /><line x1="5" y1="17" x2="20" y2="17" />
    </svg>
  )
}

function AddIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 25 25" fill="none" stroke="currentColor" strokeWidth="1.2">
      <line x1="12.5" y1="5" x2="12.5" y2="20" /><line x1="5" y1="12.5" x2="20" y2="12.5" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 25 25" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M5 7h15M9 7V5a1 1 0 011-1h5a1 1 0 011 1v2M10 11v6M14.5 11v6M6.5 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
    </svg>
  )
}

// =============================================================================
// Types
// =============================================================================

export interface SidebarConversation {
  id: string
  title: string
  status: 'active' | 'awaiting_input' | 'completed' | 'failed'
  createdAt: string
}

// =============================================================================
// Helpers
// =============================================================================

function groupByDate(conversations: SidebarConversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86_400_000)
  const week = new Date(today.getTime() - 7 * 86_400_000)

  const groups: {label: string; items: SidebarConversation[]}[] = [
    {label: 'Today', items: []},
    {label: 'Yesterday', items: []},
    {label: 'Previous 7 days', items: []},
    {label: 'Older', items: []},
  ]

  for (const c of conversations) {
    const d = new Date(c.createdAt)
    if (d >= today) groups[0].items.push(c)
    else if (d >= yesterday) groups[1].items.push(c)
    else if (d >= week) groups[2].items.push(c)
    else groups[3].items.push(c)
  }

  return groups.filter((g) => g.items.length > 0)
}

// =============================================================================
// Component
// =============================================================================

interface ChatHistoryProps {
  conversations: SidebarConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  collapsed?: boolean
  onToggle?: () => void
}

export function ChatHistory({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  collapsed = false,
  onToggle,
}: ChatHistoryProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const groups = groupByDate(conversations)

  if (collapsed) {
    return (
      <Card
        style={{width: 48, height: '100%', borderRight: '1px solid var(--card-border-color)'}}
        padding={2}
      >
        <Stack space={3} style={{alignItems: 'center'}}>
          <Button icon={MenuIcon} mode="bleed" onClick={onToggle} title="Expand sidebar" />
          <Button icon={AddIcon} mode="bleed" onClick={onNew} title="New chat" />
        </Stack>
      </Card>
    )
  }

  return (
    <Card
      style={{
        width: 256,
        height: '100%',
        borderRight: '1px solid var(--card-border-color)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid var(--card-border-color)',
        }}
      >
        <Button icon={MenuIcon} mode="bleed" onClick={onToggle} title="Collapse sidebar" />
        <button
          onClick={onNew}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: '0.8125rem',
            fontWeight: 500,
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: 'var(--card-badge-primary-bg-color, #6366f1)',
            color: '#fff',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.85'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div style={{flex: 1, overflowY: 'auto', padding: '8px 0'}}>
        {groups.length === 0 ? (
          <div style={{padding: '32px 16px', textAlign: 'center'}}>
            <Text size={1} muted>
              No conversations yet
            </Text>
            <Text size={0} muted style={{marginTop: 4}}>
              Start by typing a goal in the chat
            </Text>
          </div>
        ) : (
          <Stack space={3}>
            {groups.map((group) => (
              <Box key={group.label}>
                <div style={{padding: '4px 16px 6px'}}>
                  <Text
                    size={0}
                    weight="semibold"
                    muted
                    style={{textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '10px'}}
                  >
                    {group.label}
                  </Text>
                </div>
                <Stack space={0}>
                  {group.items.map((conv) => (
                    <div
                      key={conv.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        margin: '0 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        background: activeId === conv.id
                          ? 'var(--card-badge-primary-bg-color, rgba(99,102,241,0.12))'
                          : hoveredId === conv.id
                            ? 'var(--card-bg2-color, rgba(255,255,255,0.04))'
                            : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onClick={() => onSelect(conv.id)}
                      onMouseEnter={() => setHoveredId(conv.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background:
                            conv.status === 'active'
                              ? '#3b82f6'
                              : conv.status === 'completed'
                                ? '#22c55e'
                                : conv.status === 'failed'
                                  ? '#ef4444'
                                  : '#f59e0b',
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: '0.8125rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--card-fg-color)',
                        }}
                      >
                        {conv.title}
                      </span>
                      {hoveredId === conv.id && (
                        <button
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation()
                            onDelete(conv.id)
                          }}
                          title="Delete conversation"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 2,
                            flexShrink: 0,
                            color: 'var(--card-muted-fg-color, #a1a1aa)',
                            display: 'flex',
                          }}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </div>
    </Card>
  )
}
