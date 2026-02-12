import {useMemo, useState} from 'react'
import {Button, Card} from '@sanity/ui'
import {MarkdownContent} from './MarkdownContent'
import {parseArtifacts} from '../lib/parseArtifacts'
import type {ConversationMessage} from '../hooks/useStudioConversation'

// =============================================================================
// Props
// =============================================================================

interface AgentActivityFeedProps {
  messages?: ConversationMessage[]
  isConnected?: boolean
  isRunning?: boolean
  currentRunId?: string | null
}

// =============================================================================
// Helpers
// =============================================================================

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ''
  }
}

interface OutputItem {
  id: string
  title: string
  language?: string
  content: string
  sender: string
  timestamp: string
  isCode: boolean
}

// =============================================================================
// Styled agent pill (matches Next.js: px-2 py-0.5 rounded-full)
// =============================================================================

function AgentPill({name}: {name: string}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: '0.75rem',
        lineHeight: 1.4,
        background: 'rgba(14,165,233,0.12)',
        color: 'rgb(56,189,248)',
        border: '1px solid rgba(14,165,233,0.25)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'rgb(56,189,248)',
          flexShrink: 0,
        }}
      />
      {name}
    </span>
  )
}

function ToolPill({name}: {name: string}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: '0.75rem',
        lineHeight: 1.4,
        fontFamily: 'monospace',
        background: 'rgba(245,158,11,0.12)',
        color: 'rgb(251,191,36)',
        border: '1px solid rgba(245,158,11,0.25)',
      }}
    >
      {name}
    </span>
  )
}

// =============================================================================
// Component
// =============================================================================

export function AgentActivityFeed({
  messages = [],
  isConnected = false,
  isRunning = false,
  currentRunId = null,
}: AgentActivityFeedProps) {
  const [expandedOutputId, setExpandedOutputId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const stats = useMemo(() => {
    const agentMessages = messages.filter(
      (m) => m.sender !== 'user' && m.type !== 'user_message' && m.type !== 'answer',
    )
    const toolCalls = agentMessages.filter((m) => m.type === 'tool_call')
    const toolNames = [...new Set(toolCalls.map((m) => m.tool).filter(Boolean))]
    const msgCount = agentMessages.filter(
      (m) => m.type === 'thinking' || m.type === 'agent_message',
    ).length
    const errorCount = agentMessages.filter((m) => m.type === 'error').length
    const agentNames = [
      ...new Set(
        agentMessages
          .map((m) => m.sender)
          .filter((s) => s && s !== 'system' && s !== 'user'),
      ),
    ]
    return {toolCalls: toolCalls.length, toolNames, msgCount, errorCount, agentNames}
  }, [messages])

  const outputs = useMemo(() => {
    const items: OutputItem[] = []
    for (const m of messages) {
      if (m.type !== 'complete' || !m.output) continue
      const artifacts = parseArtifacts(m.output)
      if (
        artifacts.length > 1 ||
        (artifacts.length === 1 && artifacts[0].filename !== 'Output')
      ) {
        for (const artifact of artifacts) {
          const isCode = artifact.language !== 'text' && artifact.language !== 'markdown'
          items.push({
            id: `${m.id}-${artifact.filename}`,
            title: artifact.filename,
            language: artifact.language,
            content: artifact.content,
            sender: 'Crew',
            timestamp: m.timestamp,
            isCode,
          })
        }
      } else {
        const heading = m.output.match(/^#{1,3}\s+(.+)/m)
        const firstLine = m.output.split('\n').find((l) => l.trim().length > 0)
        items.push({
          id: m.id,
          title: heading ? heading[1].slice(0, 80) : firstLine?.slice(0, 80) || 'Output',
          content: m.output,
          sender: 'Crew',
          timestamp: m.timestamp,
          isCode: false,
        })
      }
    }
    return items
  }, [messages])

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
      {/* ── Status & Stats Card ──────────────────────────────── */}
      <div
        style={{
          border: '1px solid var(--card-border-color)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--card-border-color)',
          }}
        >
          <span style={{fontSize: '0.875rem', fontWeight: 600}}>Run Overview</span>
          <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
            {isConnected && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.75rem',
                  color: '#10b981',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#10b981',
                    animation: 'pulse 2s infinite',
                  }}
                />
                Connected
              </span>
            )}
            {isRunning && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.75rem',
                  color: '#0ea5e9',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#0ea5e9',
                    animation: 'pulse 2s infinite',
                  }}
                />
                Running
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{padding: 16}}>
          {/* Stat numbers — 3-column grid */}
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12}}>
            <div style={{textAlign: 'center'}}>
              <div style={{fontSize: '1.25rem', fontWeight: 600}}>{stats.msgCount}</div>
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--card-muted-fg-color, #71717a)',
                  marginTop: 2,
                }}
              >
                Messages
              </div>
            </div>
            <div style={{textAlign: 'center'}}>
              <div style={{fontSize: '1.25rem', fontWeight: 600}}>{stats.toolCalls}</div>
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--card-muted-fg-color, #71717a)',
                  marginTop: 2,
                }}
              >
                Tool Calls
              </div>
            </div>
            <div style={{textAlign: 'center'}}>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: stats.errorCount > 0 ? '#ef4444' : undefined,
                }}
              >
                {stats.errorCount}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--card-muted-fg-color, #71717a)',
                  marginTop: 2,
                }}
              >
                Errors
              </div>
            </div>
          </div>

          {/* Agent pills */}
          {stats.agentNames.length > 0 && (
            <div style={{marginTop: 16}}>
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--card-muted-fg-color, #71717a)',
                  marginBottom: 6,
                }}
              >
                Agents
              </div>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                {stats.agentNames.map((name) => (
                  <AgentPill key={name} name={name} />
                ))}
              </div>
            </div>
          )}

          {/* Tool pills */}
          {stats.toolNames.length > 0 && (
            <div style={{marginTop: 16}}>
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--card-muted-fg-color, #71717a)',
                  marginBottom: 6,
                }}
              >
                Tools Used
              </div>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                {stats.toolNames.map((name) => (
                  <ToolPill key={name} name={name} />
                ))}
              </div>
            </div>
          )}

          {currentRunId && (
            <div
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                color: 'var(--card-muted-fg-color, #71717a)',
                marginTop: 12,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Run: {currentRunId}
            </div>
          )}
        </div>
      </div>

      {/* ── Outputs Card ─────────────────────────────────────── */}
      <div
        style={{
          border: '1px solid var(--card-border-color)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--card-border-color)',
          }}
        >
          <span style={{fontSize: '0.875rem', fontWeight: 600}}>Outputs</span>
          {outputs.length > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--card-muted-fg-color, #71717a)',
              }}
            >
              {outputs.length} file{outputs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {outputs.length === 0 ? (
          <div style={{padding: 24, textAlign: 'center'}}>
            <div style={{fontSize: '1.5rem', marginBottom: 8, opacity: 0.4}}>📄</div>
            <div style={{fontSize: '0.875rem', color: 'var(--card-muted-fg-color, #71717a)'}}>
              {isRunning ? 'Agents are working…' : 'No outputs yet'}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--card-muted-fg-color, #71717a)',
                marginTop: 4,
              }}
            >
              Files and deliverables will appear here.
            </div>
          </div>
        ) : (
          <div>
            {outputs.map((item) => {
              const isExpanded = expandedOutputId === item.id
              const isCopied = copiedId === item.id
              return (
                <div key={item.id}>
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedOutputId(isExpanded ? null : item.id)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--card-border-color)',
                      color: 'inherit',
                    }}
                  >
                    <span style={{fontSize: '1rem', flexShrink: 0, marginTop: 2}}>
                      {item.isCode ? '📝' : '📄'}
                    </span>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 2,
                        }}
                      >
                        {item.language && item.language !== 'text' && (
                          <span
                            style={{
                              fontSize: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color: 'var(--card-muted-fg-color, #71717a)',
                            }}
                          >
                            {item.language}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--card-muted-fg-color, #71717a)',
                          }}
                        >
                          {formatTime(item.timestamp)}
                        </span>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        flexShrink: 0,
                        marginTop: 4,
                        transition: 'transform 0.15s',
                        transform: isExpanded ? 'rotate(180deg)' : 'none',
                        color: 'var(--card-muted-fg-color, #71717a)',
                      }}
                    >
                      ▼
                    </span>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: '8px 16px 16px',
                        borderBottom: '1px solid var(--card-border-color)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          marginBottom: 4,
                        }}
                      >
                        <Button
                          mode="ghost"
                          tone="default"
                          fontSize={0}
                          padding={2}
                          text={isCopied ? '✓ Copied' : 'Copy'}
                          onClick={() => handleCopy(item.id, item.content)}
                        />
                      </div>
                      <Card
                        padding={3}
                        radius={2}
                        tone="transparent"
                        style={{maxHeight: 384, overflow: 'auto'}}
                      >
                        {item.isCode ? (
                          <pre
                            style={{
                              margin: 0,
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              lineHeight: 1.6,
                              whiteSpace: 'pre',
                              overflowX: 'auto',
                            }}
                          >
                            <code>{item.content}</code>
                          </pre>
                        ) : (
                          <MarkdownContent content={item.content} />
                        )}
                      </Card>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Keyframe for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
