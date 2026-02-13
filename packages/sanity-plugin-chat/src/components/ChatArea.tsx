import {useEffect, useMemo, useRef, useState} from 'react'
import {Box, Button, Flex, TextInput} from '@sanity/ui'
import {MarkdownContent} from './MarkdownContent'
import {parseArtifacts, type Artifact} from '../lib/parseArtifacts'
import type {ConversationMessage, QuestionOption} from '../hooks/useStudioConversation'

// =============================================================================
// Props
// =============================================================================

interface ChatAreaProps {
  messages?: ConversationMessage[]
  isConnected?: boolean
  isRunning?: boolean
  awaitingInput?: boolean
  onSendMessage?: (content: string) => void
  onSendAnswer?: (content: string, questionId?: string, displayContent?: string) => void
}

const WELCOME_MESSAGE: ConversationMessage = {
  id: '0',
  type: 'system',
  sender: 'system',
  content:
    'Welcome to Agent Studio. Describe your goal to get started — agents will plan and coordinate in real time.',
  timestamp: new Date().toISOString(),
}

// =============================================================================
// Design tokens — shared across all message types for consistency
// =============================================================================

const RADIUS = 16 // rounded-2xl everywhere
const CARD_PADDING = '12px 16px' // px-4 py-3

const AGENT_COLORS: Record<string, string> = {
  planner: '#6366f1',
  narrative: '#8b5cf6',
  memory: '#8b5cf6',
  product: '#059669',
  data: '#0284c7',
  technical: '#d97706',
  seo: '#d97706',
  quality: '#e11d48',
  review: '#e11d48',
  system: '#a1a1aa',
}

function getAgentColor(sender: string): string {
  const name = sender?.toLowerCase() || ''
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (name.includes(key)) return color
  }
  return '#0284c7'
}

// =============================================================================
// Helpers
// =============================================================================

function summarize(content: string, fallback: string): string {
  if (!content) return fallback
  const heading = content.match(/^#{1,3}\s+(.+)/m)
  if (heading) return heading[1].slice(0, 80)
  const firstLine = content.split('\n').find((l) => l.trim().length > 10)
  if (firstLine) {
    const clean = firstLine.replace(/^[#*\->\s]+/, '').trim()
    return clean.length > 80 ? clean.slice(0, 77) + '…' : clean
  }
  return fallback
}

// =============================================================================
// Collapsible agent work
// =============================================================================

function CollapsibleAgentWork({
  sender,
  content,
  summary,
  color,
}: {
  sender: string
  content: string
  summary: string
  color: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{margin: '2px 0'}}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 0',
          fontSize: '0.8125rem',
          color: 'var(--card-muted-fg-color, #71717a)',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
            fontSize: 9,
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        >
          ▶
        </span>
        <span style={{fontWeight: 600, color}}>{sender}</span>
        <span style={{opacity: 0.6}}>— {summary}</span>
      </button>
      {open && (
        <div
          style={{
            marginLeft: 24,
            marginTop: 4,
            marginBottom: 8,
            paddingLeft: 12,
            borderLeft: '2px solid var(--card-border-color, rgba(255,255,255,0.1))',
          }}
        >
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Artifact card (file output) — only element that keeps a visible border
// =============================================================================

function ArtifactCard({artifact}: {artifact: Artifact}) {
  const [copied, setCopied] = useState(false)
  const isCode = artifact.language !== 'text' && artifact.language !== 'markdown'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--card-border-color, rgba(255,255,255,0.1))',
        background: 'var(--card-bg-color, rgba(255,255,255,0.03))',
      }}
    >
      {/* File header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--card-border-color, rgba(255,255,255,0.1))',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <span style={{fontSize: '0.75rem', opacity: 0.5}}>📄</span>
          <span style={{fontSize: '0.75rem', fontWeight: 600}}>
            {artifact.filename}
          </span>
          <span
            style={{
              fontSize: '0.625rem',
              opacity: 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {artifact.language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.75rem',
            color: 'var(--card-muted-fg-color, #71717a)',
            padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      {/* File content */}
      <div style={{padding: 16, maxHeight: 384, overflow: 'auto'}}>
        {isCode ? (
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
            <code>{artifact.content}</code>
          </pre>
        ) : (
          <MarkdownContent content={artifact.content} />
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Selection question (radio / checkbox)
// =============================================================================

function SelectionQuestion({
  msg,
  onSubmit,
}: {
  msg: ConversationMessage
  onSubmit: (value: string, questionId?: string, displayContent?: string) => void
}) {
  const isRadio = msg.selectionType !== 'checkbox'
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitted, setSubmitted] = useState(false)

  const toggle = (value: string) => {
    if (submitted) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (isRadio) return new Set([value])
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
        if (value === '__none__') return new Set(['__none__'])
        next.delete('__none__')
      }
      return next
    })
  }

  const options = msg.options || []

  const handleSubmit = () => {
    if (selected.size === 0) return
    setSubmitted(true)
    const answer = isRadio ? [...selected][0] : JSON.stringify([...selected])
    const labels = [...selected]
      .map((v) => options.find((o) => o.value === v)?.label || v)
      .join(', ')
    onSubmit(answer, msg.questionId, labels)
  }

  return (
    <div style={{marginTop: 12, marginBottom: 12, maxWidth: 672, marginRight: 48}}>
      {/* Sender label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
          marginLeft: 4,
          fontSize: '0.75rem',
        }}
      >
        <span style={{color: '#818cf8'}}>❓</span>
        <span style={{fontWeight: 600, color: '#818cf8'}}>{msg.sender}</span>
      </div>

      {/* Question card — subtle tinted background, no border */}
      <div
        style={{
          borderRadius: RADIUS,
          padding: '16px 20px',
          fontSize: '0.875rem',
          lineHeight: 1.6,
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        <p style={{margin: 0, marginBottom: 16, fontWeight: 600}}>{msg.content}</p>

        {/* Options */}
        <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
          {options.map((opt) => {
            const isSelected = selected.has(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggle(opt.value)}
                disabled={submitted}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1px solid ${isSelected ? '#818cf8' : 'rgba(255,255,255,0.08)'}`,
                  background: isSelected ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                  cursor: submitted ? 'default' : 'pointer',
                  opacity: submitted ? 0.7 : 1,
                  transition: 'border-color 0.15s, background 0.15s',
                  color: 'inherit',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                }}
              >
                {/* Radio / Checkbox indicator */}
                <span style={{marginTop: 2, flexShrink: 0}}>
                  {isRadio ? (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: `2px solid ${isSelected ? '#818cf8' : '#71717a'}`,
                        background: isSelected ? '#6366f1' : 'transparent',
                        boxShadow: isSelected ? '0 0 0 2px rgba(99,102,241,0.2)' : 'none',
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: `2px solid ${isSelected ? '#818cf8' : '#71717a'}`,
                        background: isSelected ? '#6366f1' : 'transparent',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {isSelected && '✓'}
                    </span>
                  )}
                </span>
                <div>
                  <div style={{fontWeight: 600}}>{opt.label}</div>
                  {opt.description && (
                    <div style={{marginTop: 4, fontSize: '0.8125rem', opacity: 0.6}}>
                      {opt.description}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Submit button */}
        {!submitted && (
          <div style={{marginTop: 16}}>
            <button
              onClick={handleSubmit}
              disabled={selected.size === 0}
              style={{
                padding: '8px 20px',
                borderRadius: 12,
                border: 'none',
                background: selected.size === 0 ? 'rgba(99,102,241,0.3)' : '#6366f1',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {isRadio ? 'Continue' : `Apply${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        )}
        {submitted && (
          <div style={{marginTop: 10, fontSize: '0.75rem', opacity: 0.5, fontStyle: 'italic'}}>
            ✓ Selection submitted
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Collapsibility logic
// =============================================================================

function isCollapsible(
  msg: ConversationMessage,
  index: number,
  allVisible: ConversationMessage[],
): boolean {
  if (msg.type !== 'agent_message') return false
  if (msg.sender === 'system' || msg.sender === 'user') return false
  if ((msg.content?.length || 0) < 100) return false
  if (msg.isReply) return false
  if (index > 0) {
    const prev = allVisible[index - 1]
    if (
      prev &&
      (prev.sender === 'user' || prev.type === 'answer' || prev.type === 'user_message')
    ) {
      return false
    }
  }
  return true
}

function getCollapseLabel(msg: ConversationMessage): string {
  const name = msg.sender?.toLowerCase() || ''
  if (name.includes('review') || name.includes('quality')) {
    return 'Reviewed and provided feedback'
  }
  return summarize(msg.content, 'Produced output')
}

// =============================================================================
// Final Output
// =============================================================================

function FinalOutput({output}: {output: string}) {
  const artifacts = useMemo(() => parseArtifacts(output), [output])
  const hasFiles =
    artifacts.length > 1 || (artifacts.length === 1 && artifacts[0].filename !== 'Output')

  if (hasFiles) {
    return (
      <div style={{marginTop: 16, maxWidth: 768, marginRight: 32}}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 12,
            marginLeft: 4,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#059669',
          }}
        >
          <span>✓</span>
          <span>
            Final Output — {artifacts.length} file{artifacts.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
          {artifacts.map((artifact, i) => (
            <ArtifactCard key={`${artifact.filename}-${i}`} artifact={artifact} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{marginTop: 16, maxWidth: 768, marginRight: 32}}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          marginLeft: 4,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#059669',
        }}
      >
        <span>✓</span>
        <span>Final Output</span>
      </div>
      <div
        style={{
          borderRadius: RADIUS,
          padding: '16px 20px',
          background: 'rgba(255,255,255,0.04)',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        <MarkdownContent content={output} />
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ChatArea({
  messages = [],
  isRunning = false,
  awaitingInput = false,
  onSendMessage,
  onSendAnswer,
}: ChatAreaProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const displayMessages = messages.length > 0 ? messages : [WELCOME_MESSAGE]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'})
  }, [displayMessages.length])

  const latestQuestionId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'question' && messages[i].questionId) {
        return messages[i].questionId
      }
    }
    return undefined
  }, [messages])

  const handleSubmit = () => {
    if (!input.trim()) return
    if (awaitingInput) {
      onSendAnswer?.(input.trim(), latestQuestionId)
    } else {
      onSendMessage?.(input.trim())
    }
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const shouldShow = (msg: ConversationMessage) => {
    if (msg.type === 'status') return false
    return true
  }

  return (
    <Flex direction="column" style={{height: '100%'}}>
      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 24px',
        }}
      >
        <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
          {(() => {
            const visibleMessages = displayMessages.filter(shouldShow)
            return visibleMessages.map((msg, idx) => {
              const isUser = msg.sender === 'user'
              const isSystem = msg.type === 'system'
              const isError = msg.type === 'error'
              const isComplete = msg.type === 'complete'
              const isThinking = msg.type === 'thinking'
              const isQuestion = msg.type === 'question'
              const color = getAgentColor(msg.sender)

              // ── Collapsible intermediate work ──
              if (isCollapsible(msg, idx, visibleMessages)) {
                return (
                  <CollapsibleAgentWork
                    key={msg.id}
                    sender={msg.sender}
                    content={msg.content}
                    summary={getCollapseLabel(msg)}
                    color={color}
                  />
                )
              }

              // ── Thinking / status — inline event ──
              if (isThinking) {
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 0',
                      fontSize: '0.8125rem',
                      color: 'var(--card-muted-fg-color, #71717a)',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#38bdf8',
                        animation: 'pulse 2s infinite',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{fontWeight: 600, color, fontSize: '0.8125rem'}}>{msg.sender}</span>
                    <span style={{opacity: 0.6}}>{msg.content}</span>
                  </div>
                )
              }

              // ── Tool call — inline event ──
              if (msg.type === 'tool_call') {
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 0',
                      fontSize: '0.8125rem',
                      color: 'var(--card-muted-fg-color, #71717a)',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#fbbf24',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{fontWeight: 600, color, fontSize: '0.8125rem'}}>{msg.sender}</span>
                    <span style={{opacity: 0.6}}>called</span>
                    <span style={{fontFamily: 'monospace', color: '#d97706'}}>
                      {msg.tool || 'tool'}
                    </span>
                  </div>
                )
              }

              // ── Tool result — inline event ──
              if (msg.type === 'tool_result') {
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 0',
                      fontSize: '0.8125rem',
                      color: 'var(--card-muted-fg-color, #71717a)',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#34d399',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{fontWeight: 600, color, fontSize: '0.8125rem'}}>{msg.sender}</span>
                    <span style={{opacity: 0.6}}>
                      ← {msg.tool || 'tool'}: {msg.content}
                    </span>
                  </div>
                )
              }

              // ── Final output ──
              if (isComplete && msg.output) {
                return <FinalOutput key={msg.id} output={msg.output} />
              }

              // ── User messages — right-aligned rounded pill ──
              if (isUser) {
                return (
                  <div
                    key={msg.id}
                    style={{display: 'flex', justifyContent: 'flex-end', marginTop: 12, marginBottom: 12}}
                  >
                    <div
                      style={{
                        maxWidth: '70%',
                        marginLeft: 48,
                        borderRadius: `${RADIUS}px ${RADIUS}px 6px ${RADIUS}px`,
                        padding: CARD_PADDING,
                        fontSize: '0.875rem',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        background: 'var(--card-badge-default-bg-color, rgba(99,102,241,0.15))',
                        color: 'var(--card-fg-color, inherit)',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                )
              }

              // ── Questions ──
              if (isQuestion) {
                const nextMsg = visibleMessages[idx + 1]
                const alreadyAnswered =
                  msg.replayed ||
                  (nextMsg && (nextMsg.type === 'answer' || nextMsg.type === 'user_message'))

                if (!alreadyAnswered && msg.options && msg.options.length > 0) {
                  return (
                    <SelectionQuestion
                      key={msg.id}
                      msg={msg}
                      onSubmit={(value, qId, display) => onSendAnswer?.(value, qId, display)}
                    />
                  )
                }

                // Read-only question (already answered or free-text)
                return (
                  <div key={msg.id} style={{marginTop: 12, marginBottom: 12, maxWidth: 672, marginRight: 48}}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 6,
                        marginLeft: 4,
                        fontSize: '0.75rem',
                      }}
                    >
                      <span style={{color: '#818cf8'}}>❓</span>
                      <span style={{fontWeight: 600, color: '#818cf8'}}>{msg.sender}</span>
                    </div>
                    <div
                      style={{
                        borderRadius: RADIUS,
                        padding: CARD_PADDING,
                        fontSize: '0.875rem',
                        lineHeight: 1.6,
                        background: 'rgba(255,255,255,0.04)',
                      }}
                    >
                      <MarkdownContent content={msg.content || ''} />
                      {alreadyAnswered && msg.options && (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: '0.75rem',
                            opacity: 0.5,
                            fontStyle: 'italic',
                          }}
                        >
                          ✓ Answered
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              // ── Errors — subtle red tint, no heavy card ──
              if (isError) {
                return (
                  <div key={msg.id} style={{marginTop: 12, marginBottom: 12, maxWidth: 672, marginRight: 48}}>
                    <div
                      style={{
                        borderRadius: RADIUS,
                        padding: CARD_PADDING,
                        fontSize: '0.875rem',
                        lineHeight: 1.6,
                        background: 'rgba(239,68,68,0.08)',
                        color: '#fca5a5',
                      }}
                    >
                      {msg.content || msg.message || 'An error occurred'}
                    </div>
                  </div>
                )
              }

              // ── System messages ──
              if (isSystem) {
                const isWelcome = msg.id === '0'

                // Welcome message — hero card with gradient
                if (isWelcome) {
                  return (
                    <div
                      key={msg.id}
                      style={{
                        marginTop: 24,
                        marginBottom: 24,
                        maxWidth: 600,
                      }}
                    >
                      <div
                        style={{
                          borderRadius: RADIUS,
                          padding: '28px 28px 24px',
                          background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)',
                          border: '1px solid rgba(99,102,241,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: '#818cf8',
                            marginBottom: 10,
                            letterSpacing: '0.02em',
                            textTransform: 'uppercase',
                          }}
                        >
                          Agent Studio
                        </div>
                        <div
                          style={{
                            fontSize: '0.875rem',
                            lineHeight: 1.6,
                            color: 'var(--card-fg-color, #e4e4e7)',
                          }}
                        >
                          Describe your goal to get started — agents will plan and coordinate in real time.
                        </div>
                      </div>
                    </div>
                  )
                }

                // Regular system messages — plain italic text
                return (
                  <div key={msg.id} style={{marginTop: 12, marginBottom: 12, maxWidth: 672, marginRight: 48}}>
                    <div
                      style={{
                        padding: '8px 0',
                        fontSize: '0.875rem',
                        lineHeight: 1.6,
                        fontStyle: 'italic',
                        color: 'var(--card-muted-fg-color, #a1a1aa)',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                )
              }

              // ── Agent messages (direct replies) — subtle background, no border ──
              return (
                <div key={msg.id} style={{marginTop: 12, marginBottom: 12, maxWidth: 672, marginRight: 48}}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color,
                      marginBottom: 4,
                      marginLeft: 4,
                    }}
                  >
                    {msg.sender}
                  </div>
                  <div
                    style={{
                      borderRadius: RADIUS,
                      padding: '16px 20px',
                      fontSize: '0.875rem',
                      lineHeight: 1.6,
                      background: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <MarkdownContent content={msg.content || ''} />
                  </div>
                </div>
              )
            })
          })()}

          {/* Typing indicator */}
          {isRunning && !awaitingInput && (
            <div style={{display: 'flex', alignItems: 'center', gap: 6, padding: '12px 0'}}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--card-muted-fg-color, #a1a1aa)',
                    animation: `bounce 1.4s infinite ${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div
        style={{
          padding: '8px 24px 24px',
          borderTop: '1px solid var(--card-border-color)',
        }}
      >
        <Flex gap={2} align="center">
          <Box flex={1}>
            <TextInput
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                awaitingInput
                  ? 'Type your answer…'
                  : isRunning
                    ? 'Add context or follow up…'
                    : 'Ask anything…'
              }
              fontSize={1}
              padding={3}
            />
          </Box>
          <Button
            tone="primary"
            mode={input.trim() ? 'default' : 'ghost'}
            disabled={!input.trim()}
            onClick={handleSubmit}
            padding={3}
            text="Send"
            fontSize={1}
          />
        </Flex>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </Flex>
  )
}
