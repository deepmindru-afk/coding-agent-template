'use client'

import { TaskMessage, Task } from '@/lib/db/schema'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowUp, Loader2, Copy, Check, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Streamdown } from 'streamdown'

interface TaskChatProps {
  taskId: string
  task: Task
}

export function TaskChat({ taskId, task }: TaskChatProps) {
  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef(0)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchMessages = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true)
      }
      setError(null)

      try {
        const response = await fetch(`/api/tasks/${taskId}/messages`)
        const data = await response.json()

        if (response.ok && data.success) {
          setMessages(data.messages)
        } else {
          setError(data.error || 'Failed to fetch messages')
        }
      } catch (err) {
        console.error('Error fetching messages:', err)
        setError('Failed to fetch messages')
      } finally {
        if (showLoading) {
          setIsLoading(false)
        }
      }
    },
    [taskId],
  )

  useEffect(() => {
    fetchMessages(true) // Show loading on initial fetch

    // Poll for new messages every 3 seconds without showing loading state
    const interval = setInterval(() => {
      fetchMessages(false) // Don't show loading on polls
    }, 3000)

    return () => clearInterval(interval)
  }, [fetchMessages])

  // Only scroll to bottom when new messages are added
  useEffect(() => {
    const currentMessageCount = messages.length
    const previousMessageCount = previousMessageCountRef.current

    // Scroll only if message count increased (new messages added)
    if (currentMessageCount > previousMessageCount && previousMessageCount > 0) {
      scrollToBottom()
    }

    // Update the ref for next comparison
    previousMessageCountRef.current = currentMessageCount

    // Also scroll on initial load (when previousMessageCount is 0 and we have messages)
    if (previousMessageCount === 0 && currentMessageCount > 0) {
      scrollToBottom()
    }
  }, [messages])

  // Timer for duration display
  useEffect(() => {
    if (task.status === 'processing' || task.status === 'pending') {
      const interval = setInterval(() => {
        setCurrentTime(Date.now())
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [task.status])

  const hasAgentResponse = (messageCreatedAt: Date) => {
    const startTime = new Date(messageCreatedAt).getTime()
    const messageIndex = messages.findIndex((m) => new Date(m.createdAt).getTime() === startTime)
    const nextAgentMessage = messages.slice(messageIndex + 1).find((m) => m.role === 'agent')
    return !!nextAgentMessage
  }

  const isLatestUserMessage = (messageCreatedAt: Date) => {
    // Find the last user message in the list
    const userMessages = messages.filter((m) => m.role === 'user')
    if (userMessages.length === 0) return false

    const lastUserMessage = userMessages[userMessages.length - 1]
    const lastUserTime = new Date(lastUserMessage.createdAt).getTime()
    const thisMessageTime = new Date(messageCreatedAt).getTime()

    return lastUserTime === thisMessageTime
  }

  const formatDuration = (messageCreatedAt: Date) => {
    const startTime = new Date(messageCreatedAt).getTime()

    // Find the next agent message after this user message
    const messageIndex = messages.findIndex((m) => new Date(m.createdAt).getTime() === startTime)
    const nextAgentMessage = messages.slice(messageIndex + 1).find((m) => m.role === 'agent')

    const endTime = nextAgentMessage
      ? new Date(nextAgentMessage.createdAt).getTime()
      : task.completedAt
        ? new Date(task.completedAt).getTime()
        : currentTime

    const durationMs = Math.max(0, endTime - startTime) // Ensure non-negative
    const durationSeconds = Math.floor(durationMs / 1000)

    const minutes = Math.floor(durationSeconds / 60)
    const seconds = durationSeconds % 60

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending) return

    setIsSending(true)
    const messageToSend = newMessage.trim()
    setNewMessage('')

    try {
      const response = await fetch(`/api/tasks/${taskId}/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageToSend,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Refresh messages to show the new user message without loading state
        await fetchMessages(false)
      } else {
        toast.error(data.error || 'Failed to send message')
        setNewMessage(messageToSend) // Restore the message
      }
    } catch (err) {
      console.error('Error sending message:', err)
      toast.error('Failed to send message')
      setNewMessage(messageToSend) // Restore the message
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (err) {
      console.error('Failed to copy message:', err)
      toast.error('Failed to copy message')
    }
  }

  const handleRetryMessage = async (content: string) => {
    if (isSending) return

    setIsSending(true)

    try {
      const response = await fetch(`/api/tasks/${taskId}/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Refresh messages to show the new user message without loading state
        await fetchMessages(false)
      } else {
        toast.error(data.error || 'Failed to resend message')
      }
    } catch (err) {
      console.error('Error resending message:', err)
      toast.error('Failed to resend message')
    } finally {
      setIsSending(false)
    }
  }

  const parseAgentMessage = (content: string): string => {
    try {
      const parsed = JSON.parse(content)
      // Check if it's a Cursor agent response with a result field
      if (parsed && typeof parsed === 'object' && 'result' in parsed && typeof parsed.result === 'string') {
        return parsed.result
      }
      return content
    } catch {
      // Not valid JSON, return as-is
      return content
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-xs md:text-sm text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-destructive mb-2 text-xs md:text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div className="text-sm md:text-base">No messages yet</div>
        </div>

        <div className="flex-shrink-0 relative">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a follow-up message..."
            className="w-full min-h-[60px] max-h-[120px] resize-none pr-12"
            disabled={isSending}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isSending}
            size="icon"
            className="absolute bottom-2 right-2 rounded-full h-8 w-8 p-0"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4">
        {messages.map((message) => (
          <div key={message.id}>
            {message.role === 'user' ? (
              <div className="space-y-1">
                <Card className="p-2 bg-card rounded-md">
                  <div className="text-xs">
                    <Streamdown
                      components={{
                        code: ({ className, children, ...props }: any) => (
                          <code className={`${className} !text-xs`} {...props}>
                            {children}
                          </code>
                        ),
                        pre: ({ children, ...props }: any) => (
                          <pre className="!text-xs" {...props}>
                            {children}
                          </pre>
                        ),
                      }}
                    >
                      {message.content}
                    </Streamdown>
                  </div>
                </Card>
                <div className="flex items-center gap-0.5 pr-1 justify-end">
                  {!hasAgentResponse(message.createdAt) && isLatestUserMessage(message.createdAt) && (
                    <div className="text-xs text-muted-foreground font-mono mr-auto pl-4 opacity-30">
                      {formatDuration(message.createdAt)}
                    </div>
                  )}
                  <button
                    onClick={() => handleRetryMessage(message.content)}
                    disabled={isSending}
                    className="h-3.5 w-3.5 opacity-30 hover:opacity-70 flex items-center justify-center disabled:opacity-20"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleCopyMessage(message.id, message.content)}
                    className="h-3.5 w-3.5 opacity-30 hover:opacity-70 flex items-center justify-center"
                  >
                    {copiedMessageId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  <Streamdown
                    components={{
                      code: ({ className, children, ...props }: any) => (
                        <code className={`${className} !text-xs`} {...props}>
                          {children}
                        </code>
                      ),
                      pre: ({ children, ...props }: any) => (
                        <pre className="!text-xs" {...props}>
                          {children}
                        </pre>
                      ),
                    }}
                  >
                    {parseAgentMessage(message.content)}
                  </Streamdown>
                </div>
                <div className="flex items-center gap-0.5 justify-end">
                  <button
                    onClick={() => handleCopyMessage(message.id, parseAgentMessage(message.content))}
                    className="h-3.5 w-3.5 opacity-30 hover:opacity-70 flex items-center justify-center"
                  >
                    {copiedMessageId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 relative">
        <Textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a follow-up message..."
          className="w-full min-h-[60px] max-h-[120px] resize-none pr-12 text-xs"
          disabled={isSending}
        />
        <button
          onClick={handleSendMessage}
          disabled={!newMessage.trim() || isSending}
          className="absolute bottom-2 right-2 rounded-full h-5 w-5 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" />}
        </button>
      </div>
    </div>
  )
}
