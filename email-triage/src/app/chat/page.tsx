'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
}

interface ChatImage {
  base64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
  toolCalls?: ToolCall[];
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

const TOOL_LABELS: Record<string, string> = {
  gmail_search: 'Searching email',
  gmail_read: 'Reading email',
  gmail_send: 'Sending email',
  gmail_draft: 'Creating draft',
  gmail_archive: 'Archiving emails',
  calendar_today: 'Checking calendar',
  calendar_range: 'Checking week',
  calendar_create: 'Creating event',
  calendar_find_free_time: 'Finding free time',
  calendar_rsvp: 'Updating RSVP',
  slack_send: 'Sending Slack message',
  contact_lookup: 'Looking up contact',
  contact_add: 'Adding contact',
  contact_update: 'Updating contact',
  reminder_create: 'Creating todo',
  reminder_list: 'Listing todos',
  reminder_complete: 'Completing todo',
  todo_prioritize: 'Prioritizing todos',
  get_current_time: 'Checking time',
  note_to_self: 'Saving note',
  web_search: 'Searching the web',
  browser_navigate: 'Opening webpage',
  browser_click: 'Clicking element',
  browser_type: 'Typing in field',
  browser_select: 'Selecting option',
  browser_scroll: 'Scrolling page',
  browser_close: 'Closing browser',
};

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [attachedImages, setAttachedImages] = useState<ChatImage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fileToBase64 = (file: File): Promise<ChatImage | null> => {
    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
    type ValidType = typeof validTypes[number];
    if (!validTypes.includes(file.type as ValidType)) return Promise.resolve(null);

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve({ base64, mediaType: file.type as ChatImage['mediaType'] });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const addImagesFromFiles = async (files: FileList | File[]) => {
    const results = await Promise.all(Array.from(files).map(fileToBase64));
    const valid = results.filter((r): r is ChatImage => r !== null);
    if (valid.length > 0) {
      setAttachedImages((prev) => [...prev, ...valid]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      addImagesFromFiles(imageFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      addImagesFromFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/agent/conversations');
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations);
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/agent/conversations/${id}`);
    if (!res.ok) return;
    const { conversation } = await res.json();
    const rawMessages = conversation.messages as Array<{
      role: string;
      content: string | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
    }>;

    const loaded: ChatMessage[] = [];
    for (const msg of rawMessages) {
      if (msg.role === 'user') {
        // Skip tool_result messages (they're part of the agent loop, not user-visible)
        if (Array.isArray(msg.content) && msg.content.some((b) => b.type === 'tool_result')) {
          continue;
        }
        let text = '';
        const images: ChatImage[] = [];
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && block.text) text += block.text;
            if (block.type === 'image' && (block as Record<string, unknown>).source) {
              const src = (block as Record<string, unknown>).source as { data: string; media_type: string };
              images.push({ base64: src.data, mediaType: src.media_type as ChatImage['mediaType'] });
            }
          }
        }
        if (text || images.length > 0) {
          loaded.push({
            role: 'user',
            content: text || '(image)',
            images: images.length > 0 ? images : undefined,
            timestamp: new Date(conversation.updated_at),
          });
        }
      } else if (msg.role === 'assistant') {
        let text = '';
        const toolCalls: ToolCall[] = [];
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && block.text) text += block.text;
            if (block.type === 'tool_use' && block.name) {
              toolCalls.push({
                name: block.name,
                input: block.input || {},
                result: undefined,
              });
            }
          }
        }
        // Only add if there's actual text (tool-only assistant turns are intermediate)
        if (text) {
          loaded.push({
            role: 'assistant',
            content: text,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            timestamp: new Date(conversation.updated_at),
          });
        }
      }
    }

    setMessages(loaded);
    setConversationId(id);
    setShowSidebar(false);
  }, []);

  useEffect(() => {
    if (session) loadConversations();
  }, [session, loadConversations]);

  const [activeToolCalls, setActiveToolCalls] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed && attachedImages.length === 0) return;
    if (isLoading) return;

    const images = attachedImages.length > 0 ? [...attachedImages] : undefined;

    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed || '(image)',
      images,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachedImages([]);
    setIsLoading(true);
    setActiveToolCalls([]);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          images,
          conversationId,
          stream: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Request failed');
      }

      // Parse Server-Sent Events stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';
      const collectedToolCalls: ToolCall[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ') && eventType) {
            const data = JSON.parse(line.slice(6));

            if (eventType === 'tool_call') {
              setActiveToolCalls((prev) => [...prev, data.name]);
              collectedToolCalls.push({ name: data.name, input: {}, result: undefined });
            } else if (eventType === 'tool_result') {
              // Tool finished — keep it in the list but it's done
            } else if (eventType === 'done') {
              const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: data.response,
                toolCalls: data.toolCalls || (collectedToolCalls.length > 0 ? collectedToolCalls : undefined),
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, assistantMessage]);
              setActiveToolCalls([]);

              if (data.conversationId && !conversationId) {
                setConversationId(data.conversationId);
                loadConversations();
              }
            } else if (eventType === 'error') {
              throw new Error(data.error);
            }
          }
        }
      }
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Sorry, something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setActiveToolCalls([]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setShowSidebar(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-medium-gray">Loading...</p>
      </div>
    );
  }

  return (
    <div className="-mx-6 -mt-8 flex h-[calc(100vh-73px)]">
      {/* Sidebar */}
      <div
        className={`${
          showSidebar ? 'w-72' : 'w-0'
        } flex-shrink-0 overflow-hidden border-r border-brand-border bg-white transition-all duration-200`}
      >
        <div className="flex h-full w-72 flex-col">
          <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
            <span className="text-sm font-medium text-charcoal">Conversations</span>
            <button
              onClick={startNewConversation}
              className="rounded-md bg-tan-light px-3 py-1 text-xs font-medium text-charcoal transition-colors hover:bg-tan"
            >
              + New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full border-b border-brand-border px-4 py-3 text-left transition-colors hover:bg-cream ${
                  conversationId === conv.id ? 'bg-cream' : ''
                }`}
              >
                <p className="truncate text-sm text-charcoal">
                  {conv.title || 'Untitled'}
                </p>
                <p className="mt-0.5 text-xs text-light-gray">
                  {new Date(conv.updated_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-light-gray">
                No conversations yet
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-brand-border bg-white px-6 py-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="rounded p-1 text-medium-gray transition-colors hover:bg-cream hover:text-charcoal"
            title="Toggle conversations"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </button>
          <div>
            <h1 className="font-serif text-lg text-charcoal">EA Agent</h1>
            <p className="text-xs text-medium-gray">
              Your personal executive assistant — email, calendar, Slack, tasks
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <div className="text-center">
                <h2 className="font-serif text-2xl text-charcoal">
                  Hi{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}
                </h2>
                <p className="mt-2 text-sm text-medium-gray">
                  What can I help you with?
                </p>
              </div>
              <div className="grid max-w-xl grid-cols-2 gap-3">
                {[
                  "What's on my calendar today?",
                  'Do I have any unread emails from this week?',
                  'Remind me to follow up with the team tomorrow',
                  'Find a free 30-min slot this afternoon',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="rounded-lg border border-brand-border bg-white px-4 py-3 text-left text-sm text-dark-gray transition-colors hover:border-tan hover:bg-cream"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-navy text-white'
                    : 'border border-brand-border bg-white text-charcoal'
                }`}
              >
                {/* Tool calls indicator */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {msg.toolCalls.map((tc, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 rounded-full bg-tan-light px-2.5 py-0.5 text-[11px] font-medium text-tan-dark"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {TOOL_LABELS[tc.name] || tc.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Attached images */}
                {msg.images && msg.images.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {msg.images.map((img, j) => (
                      <img
                        key={j}
                        src={`data:${img.mediaType};base64,${img.base64}`}
                        alt={`Attached image ${j + 1}`}
                        className="max-h-48 max-w-full rounded-lg"
                      />
                    ))}
                  </div>
                )}

                {/* Message content */}
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none leading-relaxed text-charcoal prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-charcoal prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-a:text-navy prose-strong:text-charcoal prose-code:text-charcoal prose-code:bg-cream prose-code:rounded prose-code:px-1 prose-pre:bg-cream prose-pre:rounded-lg">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {msg.content}
                  </div>
                )}

                <div
                  className={`mt-1.5 text-[10px] ${
                    msg.role === 'user' ? 'text-white/50' : 'text-light-gray'
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="mb-4 flex justify-start">
              <div className="max-w-[80%] rounded-xl border border-brand-border bg-white px-4 py-3">
                {/* Show active tool calls as they stream in */}
                {activeToolCalls.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {activeToolCalls.map((name, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 rounded-full bg-tan-light px-2.5 py-0.5 text-[11px] font-medium text-tan-dark"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="animate-spin"
                        >
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        {TOOL_LABELS[name] || name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-tan-dark [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-tan-dark [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-tan-dark [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs text-medium-gray">
                    {activeToolCalls.length > 0
                      ? TOOL_LABELS[activeToolCalls[activeToolCalls.length - 1]] || 'Working...'
                      : 'Thinking...'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          className="border-t border-brand-border bg-white px-6 py-4"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {/* Image previews */}
          {attachedImages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedImages.map((img, i) => (
                <div key={i} className="group relative">
                  <img
                    src={`data:${img.mediaType};base64,${img.base64}`}
                    alt={`Attached ${i + 1}`}
                    className="h-16 w-16 rounded-lg border border-brand-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-charcoal text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Ask your EA anything... (paste or drop images)"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-brand-border bg-cream px-4 py-3 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
              style={{ maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              type="submit"
              disabled={(!input.trim() && attachedImages.length === 0) || isLoading}
              className="rounded-lg bg-navy px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-navy/90 disabled:opacity-40 disabled:hover:bg-navy"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
