import {useEffect, useMemo, useRef, useState} from 'react'
import {Box, Button, Card, Flex, Stack, Text, TextInput} from '@sanity/ui'
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
// Agent colour palette
// =============================================================================

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
    <div style={{margin: '4px 0'}}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 0',
          fontSize: '0.75rem',
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
            borderLeft: '2px solid var(--card-border-color, #e4e4e7)',
          }}
        >
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Artifact card (file output)
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
    <Card border radius={2} overflow="hidden" tone="transparent">
      <Flex
        align="center"
        justify="space-between"
        padding={3}
        style={{borderBottom: '1px solid var(--card-border-color)'}}
      >
        <Flex align="center" gap={2}>
          <Text size={0} muted>
            📄
          </Text>
          <Text size={1} weight="medium">
            {artifact.filename}
          </Text>
          <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: '0.05em'}}>
            {artifact.language}
          </Text>
        </Flex>
        <Button
          mode="bleed"
          tone="default"
          fontSize={0}
          padding={2}
          text={copied ? '✓ Copied' : 'Copy'}
          onClick={handleCopy}
        />
      </Flex>
      <Box padding={4} style={{maxHeight: 384, overflow: 'auto'}}>
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
      </Box>
    </Card>
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
    <div style={{margin: '12px 0', maxWidth: 672, marginRight: 48}}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          marginLeft: 4,
        }}
      >
        <span style={{fontSize: '0.75rem', color: '#6366f1'}}>❓</span>
        <span style={{fontSize: '0.75rem', fontWeight: 600, color: '#6366f1'}}>{msg.sender}</span>
      </div>
      <Card padding={4} radius={2} tone="caution">
        <Text size={1} weight="medium">
          {msg.content}
        </Text>
        <Stack space={2} marginTop={4}>
          {options.map((opt) => {
            const isSelected = selected.has(opt.value)
            return (
              <Card
                key={opt.value}
                as="button"
                padding={3}
                radius={2}
                border
                tone={isSelected ? 'primary' : 'default'}
                style={{
                  cursor: submitted ? 'default' : 'pointer',
                  opacity: submitted ? 0.7 : 1,
                  textAlign: 'left',
                  width: '100%',
                }}
                onClick={() => toggle(opt.value)}
              >
                <Flex align="flex-start" gap={3}>
                  <span style={{marginTop: 2, flexShrink: 0}}>
                    {isRadio ? (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: `2px solid ${isSelected ? '#6366f1' : '#a1a1aa'}`,
                          background: isSelected ? '#6366f1' : 'transparent',
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          border: `2px solid ${isSelected ? '#6366f1' : '#a1a1aa'}`,
                          background: isSelected ? '#6366f1' : 'transparent',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {isSelected && '✓'}
                      </span>
                    )}
                  </span>
                  <div>
                    <Text size={1} weight="medium">
                      {opt.label}
                    </Text>
                    {opt.description && (
                      <Text size={0} muted style={{marginTop: 2}}>
                        {opt.description}
                      </Text>
                    )}
                  </div>
                </Flex>
              </Card>
            )
          })}
        </Stack>
        {!submitted && (
          <div style={{marginTop: 12}}>
            <Button
              tone="primary"
              text={
                isRadio ? 'Continue' : `Apply${selected.size > 0 ? ` (${selected.size})` : ''}`
              }
              disabled={selected.size === 0}
              onClick={handleSubmit}
              fontSize={1}
              padding={3}
            />
          </div>
        )}
        {submitted && (
          <Text size={0} muted style={{marginTop: 8, fontStyle: 'italic'}}>
            ✓ Selection submitted
          </Text>
        )}
      </Card>
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
      <div style={{margin: '16px 0', maxWidth: 768, marginRight: 32}}>
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
        <Stack space={3}>
          {artifacts.map((artifact, i) => (
            <ArtifactCard key={`${artifact.filename}-${i}`} artifact={artifact} />
          ))}
        </Stack>
      </div>
    )
  }

  return (
    <div style={{margin: '16px 0', maxWidth: 768, marginRight: 32}}>
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
      <Card padding={5} radius={2} tone="transparent" border>
        <MarkdownContent content={output} />
      </Card>
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
      {/* Messages — generous padding to match the Next.js layout */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 24px',
        }}
      >
        <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
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

              // Collapsible intermediate work
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

              // Thinking / status
              if (isThinking) {
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 0',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#38bdf8',
                        animation: 'pulse 2s infinite',
                      }}
                    />
                    <span style={{fontSize: '0.75rem', fontWeight: 600, color}}>{msg.sender}</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--card-muted-fg-color, #71717a)',
                        opacity: 0.6,
                      }}
                    >
                      {msg.content}
                    </span>
                  </div>
                )
              }

              // Tool call
              if (msg.type === 'tool_call') {
                return (
                  <div
                    key={msg.id}
                    style={{display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0'}}
                  >
                    <span
                      style={{width: 6, height: 6, borderRadius: '50%', background: '#fbbf24'}}
                    />
                    <span style={{fontSize: '0.75rem', fontWeight: 600, color}}>{msg.sender}</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--card-muted-fg-color, #71717a)',
                      }}
                    >
                      called
                    </span>
                    <span style={{fontSize: '0.75rem', fontFamily: 'monospace', color: '#d97706'}}>
                      {msg.tool || 'tool'}
                    </span>
                  </div>
                )
              }

              // Tool result
              if (msg.type === 'tool_result') {
                return (
                  <div
                    key={msg.id}
                    style={{display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0'}}
                  >
                    <span
                      style={{width: 6, height: 6, borderRadius: '50%', background: '#34d399'}}
                    />
                    <span style={{fontSize: '0.75rem', fontWeight: 600, color}}>{msg.sender}</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--card-muted-fg-color, #71717a)',
                      }}
                    >
                      ← {msg.tool || 'tool'}: {msg.content}
                    </span>
                  </div>
                )
              }

              // Final output
              if (isComplete && msg.output) {
                return <FinalOutput key={msg.id} output={msg.output} />
              }

              // User messages — right-aligned with generous padding
              if (isUser) {
                return (
                  <div key={msg.id} style={{display: 'flex', justifyContent: 'flex-end', marginTop: 12}}>
                    <Card
                      padding={4}
                      radius={3}
                      tone="primary"
                      style={{maxWidth: '70%', marginLeft: 48}}
                    >
                      <Text size={1} style={{whiteSpace: 'pre-wrap', lineHeight: 1.6}}>
                        {msg.content}
                      </Text>
                    </Card>
                  </div>
                )
              }

              // Questions
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

                return (
                  <div key={msg.id} style={{marginTop: 12, maxWidth: 672, marginRight: 48}}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 4,
                        marginLeft: 4,
                        fontSize: '0.75rem',
                      }}
                    >
                      <span style={{color: '#6366f1'}}>❓</span>
                      <span style={{fontWeight: 600, color: '#6366f1'}}>{msg.sender}</span>
                    </div>
                    <Card padding={4} radius={2} tone="caution">
                      <MarkdownContent content={msg.content || ''} />
                      {alreadyAnswered && msg.options && (
                        <Text size={0} muted style={{marginTop: 4, fontStyle: 'italic'}}>
                          ✓ Answered
                        </Text>
                      )}
                    </Card>
                  </div>
                )
              }

              // Errors
              if (isError) {
                return (
                  <div key={msg.id} style={{marginTop: 8, maxWidth: 672, marginRight: 48}}>
                    <Card padding={4} radius={2} tone="critical">
                      <Text size={1}>{msg.content || msg.message || 'An error occurred'}</Text>
                    </Card>
                  </div>
                )
              }

              // System messages
              if (isSystem) {
                return (
                  <div key={msg.id} style={{marginTop: 8, maxWidth: 672, marginRight: 48}}>
                    <Text
                      size={1}
                      muted
                      style={{fontStyle: 'italic', padding: '8px 0', lineHeight: 1.6}}
                    >
                      {msg.content}
                    </Text>
                  </div>
                )
              }

              // Agent messages (direct replies) — generous padding
              return (
                <div key={msg.id} style={{marginTop: 8, maxWidth: 672, marginRight: 48}}>
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
                  <Card padding={4} radius={2} tone="transparent" border>
                    <MarkdownContent content={msg.content || ''} />
                  </Card>
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

      {/* Input — more spacious to match Next.js */}
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
