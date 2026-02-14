import {useState, useCallback, useEffect} from 'react'
import {useClient} from 'sanity'
import {Box, Flex, useToast} from '@sanity/ui'
import {ChatArea} from './components/ChatArea'
import {ChatHistory, type SidebarConversation} from './components/ChatHistory'
import {AgentActivityFeed} from './components/AgentActivityFeed'
import {useStudioConversation} from './hooks/useStudioConversation'
import type {MessageAttachment} from './hooks/useStudioConversation'

// =============================================================================
// Config — where is the backend?
// Only used for the WebSocket connection. All CRUD goes through Sanity directly.
//
// Backends:
//   Python (FastAPI/CrewAI): http://localhost:8000  (default)
//   Mastra (TypeScript):     http://localhost:4111
//
// Switch by setting SANITY_STUDIO_API_URL in your .env:
//   SANITY_STUDIO_API_URL=http://localhost:4111
// =============================================================================

function getApiUrl(): string {
  try {
    const fromEnv = process.env.SANITY_STUDIO_API_URL
    if (fromEnv) return fromEnv
  } catch {
    // process.env may not exist in all bundler configs
  }
  return 'http://localhost:8000'
}

// =============================================================================
// Helpers
// =============================================================================

function generateConvId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `conv-${hex}`
}

// =============================================================================
// Types
// =============================================================================

interface SanityConversation {
  _id: string
  _createdAt: string
  title?: string
  status?: string
}

// =============================================================================
// Main tool component
// =============================================================================

// Read conversation ID from URL hash (e.g. #conv-abc123)
function getConvIdFromHash(): string | null {
  try {
    const hash = window.location.hash.replace('#', '')
    return hash && hash.startsWith('conv-') ? hash : null
  } catch {
    return null
  }
}

// Write conversation ID to URL hash (enables shareable links)
function setConvIdInHash(convId: string | null) {
  try {
    if (convId) {
      window.history.replaceState(null, '', `#${convId}`)
    } else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  } catch {
    // Ignore if history API is unavailable
  }
}

export function ChatTool() {
  const client = useClient({apiVersion: '2024-01-01'})
  const toast = useToast()
  const apiUrl = getApiUrl()

  // ── Conversation list state ──────────────────────────────────
  const [conversations, setConversations] = useState<SidebarConversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(getConvIdFromHash)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Sync URL hash → state on browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const id = getConvIdFromHash()
      if (id !== activeConvId) setActiveConvId(id)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [activeConvId])

  // ── Fetch conversations directly from Sanity ─────────────────
  const fetchConversations = useCallback(async () => {
    try {
      const data = await client.fetch<SanityConversation[]>(
        `*[_type == "conversation"] | order(_createdAt desc) {
          _id,
          _createdAt,
          title,
          status
        }`,
      )
      const mapped: SidebarConversation[] = data.map((c) => ({
        id: c._id,
        title: c.title || 'New Conversation',
        status: (c.status as SidebarConversation['status']) || 'active',
        createdAt: c._createdAt || new Date().toISOString(),
      }))
      setConversations(mapped)
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    }
  }, [client])

  useEffect(() => {
    fetchConversations()
    const interval = setInterval(fetchConversations, 30_000)
    return () => clearInterval(interval)
  }, [fetchConversations])

  // ── Create conversation directly in Sanity ───────────────────
  const createConversation = useCallback(
    async (title: string): Promise<string> => {
      const convId = generateConvId()
      await client.createOrReplace({
        _id: convId,
        _type: 'conversation',
        title,
        status: 'active',
        messages: [],
        runs: [],
      })
      return convId
    },
    [client],
  )

  // ── Delete conversation directly in Sanity ───────────────────
  const deleteConversation = useCallback(
    async (convId: string) => {
      // Fetch run references so we can delete those too
      const conv = await client.fetch<{runs?: Array<{_ref?: string}>} | null>(
        `*[_type == "conversation" && _id == $id][0]{ runs }`,
        {id: convId},
      )
      const mutations = [client.delete(convId)]
      if (conv?.runs) {
        for (const r of conv.runs) {
          const runId = r?._ref
          if (runId) mutations.push(client.delete(runId))
        }
      }
      await Promise.allSettled(mutations)
    },
    [client],
  )

  // ── WebSocket conversation (only thing that talks to FastAPI) ─
  const {
    messages,
    isConnected,
    isRunning,
    awaitingInput,
    currentRunId,
    sendMessage,
    sendAnswer,
  } = useStudioConversation(activeConvId, {
    apiUrl,
    onComplete: () => {
      toast.push({
        status: 'success',
        title: 'Run complete',
        description: 'Crew finished successfully.',
      })
      fetchConversations()
    },
    onError: (msg) => {
      toast.push({
        status: 'error',
        title: 'Error',
        description: msg,
      })
    },
  })

  // ── Handlers ─────────────────────────────────────────────────

  const handleNewChat = useCallback(async () => {
    try {
      const convId = await createConversation('New Conversation')
      setActiveConvId(convId)
      setConvIdInHash(convId)
      fetchConversations()
    } catch (err) {
      console.error('Failed to create conversation:', err)
      toast.push({status: 'error', title: 'Error', description: 'Could not create conversation.'})
    }
  }, [createConversation, fetchConversations, toast])

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConvId(id)
    setConvIdInHash(id)
  }, [])

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeConvId === id) {
        setActiveConvId(null)
        setConvIdInHash(null)
      }
      try {
        await deleteConversation(id)
      } catch (err) {
        console.error('Failed to delete conversation:', err)
        toast.push({status: 'error', title: 'Error', description: 'Could not delete conversation.'})
        fetchConversations()
      }
    },
    [activeConvId, deleteConversation, fetchConversations, toast],
  )

  const handleSendMessage = useCallback(
    async (content: string, attachments?: MessageAttachment[]) => {
      if (!activeConvId) {
        // Auto-create a conversation when user sends the first message
        try {
          const convId = await createConversation(content.slice(0, 80))
          setActiveConvId(convId)
          setConvIdInHash(convId)
          fetchConversations()
          // Give the WS a moment to connect before sending
          setTimeout(() => sendMessage(content, attachments), 500)
        } catch {
          toast.push({
            status: 'error',
            title: 'Error',
            description: 'Could not create conversation.',
          })
        }
        return
      }
      sendMessage(content, attachments)
    },
    [activeConvId, createConversation, sendMessage, fetchConversations, toast],
  )

  const handleSendAnswer = useCallback(
    (content: string, questionId?: string, displayContent?: string) => {
      sendAnswer(content, questionId, displayContent)
    },
    [sendAnswer],
  )

  // ── Layout ───────────────────────────────────────────────────

  return (
    <Flex style={{height: '100%'}}>
      {/* Left sidebar */}
      <ChatHistory
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
      />

      {/* Main chat area */}
      <Box flex={1} style={{minWidth: 0, height: '100%'}}>
        <ChatArea
          messages={messages}
          isConnected={isConnected}
          isRunning={isRunning}
          awaitingInput={awaitingInput}
          onSendMessage={handleSendMessage}
          onSendAnswer={handleSendAnswer}
          sanityClient={client}
        />
      </Box>

      {/* Right sidebar — matches Next.js lg:w-96 (384px) + p-4 (16px) */}
      <div
        style={{
          width: 384,
          height: '100%',
          borderLeft: '1px solid var(--card-border-color)',
          overflowY: 'auto',
          padding: 16,
          flexShrink: 0,
        }}
      >
        <AgentActivityFeed
          messages={messages}
          isConnected={isConnected}
          isRunning={isRunning}
          currentRunId={currentRunId}
        />
      </div>
    </Flex>
  )
}
