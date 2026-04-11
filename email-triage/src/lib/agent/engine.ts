import Anthropic from '@anthropic-ai/sdk';
import { agentTools } from './tools';
import { executeTool } from './handlers';
import { AGENT_SYSTEM_PROMPT, loadContacts } from './system-prompt';
import type { TeamMember } from '@/types';

const anthropic = new Anthropic();

const MAX_TOOL_ROUNDS = 10;

// ─── Types ───

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: {
    name: string;
    input: Record<string, unknown>;
    result: unknown;
  }[];
}

interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolCall?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: unknown) => void;
  onDone?: (fullResponse: string) => void;
}

// ─── Agentic Loop ───

/**
 * Run the EA agent with a conversation history and new user message.
 * The agent can call tools in a loop until it produces a final text response.
 */
export async function runAgent(
  member: TeamMember,
  conversationHistory: Anthropic.MessageParam[],
  userMessage: string,
  callbacks?: StreamCallbacks,
  images?: { base64: string; mediaType: string }[]
): Promise<{ response: string; messages: Anthropic.MessageParam[]; toolCalls: AgentMessage['toolCalls'] }> {
  // Build user content — text only, or multi-part with images
  let userContent: Anthropic.MessageParam['content'];
  if (images && images.length > 0) {
    const parts: Anthropic.ContentBlockParam[] = [];
    for (const img of images) {
      parts.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          data: img.base64,
        },
      });
    }
    if (userMessage) {
      parts.push({ type: 'text', text: userMessage });
    }
    userContent = parts;
  } else {
    userContent = userMessage;
  }

  // Build messages array with conversation history + new user message
  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory,
    { role: 'user', content: userContent },
  ];

  // Load contacts for system prompt injection
  const contacts = await loadContacts(member.id);

  const allToolCalls: NonNullable<AgentMessage['toolCalls']> = [];
  let finalResponse = '';
  let rounds = 0;
  let browserToolCalls = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: AGENT_SYSTEM_PROMPT(member, contacts),
      tools: [
        // Server-side web search — executed by Anthropic, no handler needed
        { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
        // Client-side tools — executed by our handlers
        ...agentTools,
      ],
      messages,
    });

    // Process the response content blocks
    const toolUseBlocks: Anthropic.ContentBlockParam[] = [];
    let hasClientToolUse = false;

    for (const block of response.content) {
      if (block.type === 'text') {
        finalResponse += block.text;
        callbacks?.onText?.(block.text);
      } else if (block.type === 'tool_use') {
        // Client-side tool — we need to execute it
        hasClientToolUse = true;
        callbacks?.onToolCall?.(block.name, block.input as Record<string, unknown>);

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          member
        );

        allToolCalls.push({
          name: block.name,
          input: block.input as Record<string, unknown>,
          result: result.success ? result.data : { error: result.error },
        });

        callbacks?.onToolResult?.(block.name, result);

        // If the tool returned a screenshot, include it as an image content block
        // so Claude can see the browser page
        if (result.screenshot) {
          toolUseBlocks.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: [
              {
                type: 'text',
                text: JSON.stringify(result.success ? result.data : { error: result.error }),
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: result.screenshot,
                },
              },
            ],
          } as Anthropic.ContentBlockParam);
        } else {
          toolUseBlocks.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result.success ? result.data : { error: result.error }),
          });
        }
      } else if (block.type === 'server_tool_use') {
        // Server-side tool (web_search) — executed by Anthropic, just track it
        allToolCalls.push({
          name: block.name,
          input: block.input as Record<string, unknown>,
          result: '(server-executed)',
        });
        callbacks?.onToolCall?.(block.name, block.input as Record<string, unknown>);
      }
      // web_search_tool_result blocks are handled automatically by the API
    }

    // If no client tool calls, we're done — Claude produced its final answer
    // (server-side tools like web_search are already resolved in the same response)
    if (!hasClientToolUse) {
      break;
    }

    // Count browser tool calls — force the agent to return to the user after 2
    // so browser tasks are conversational, not autonomous marathons
    const browserTools = ['browser_navigate', 'browser_click', 'browser_type', 'browser_select', 'browser_scroll'];
    for (const tc of allToolCalls.slice(-10)) {
      if (browserTools.includes(tc.name)) browserToolCalls++;
    }
    if (browserToolCalls >= 3) {
      // Inject a nudge so Claude wraps up this turn
      toolUseBlocks.push({
        type: 'text',
        text: '[SYSTEM: You have used multiple browser actions this turn. STOP here, describe what you see on the page, and ask the user for input before continuing. Do NOT call more browser tools.]',
      } as Anthropic.ContentBlockParam);
    }

    // Append the assistant response and tool results back into the conversation
    messages.push({
      role: 'assistant',
      content: response.content as Anthropic.ContentBlockParam[],
    });
    messages.push({
      role: 'user',
      content: toolUseBlocks,
    });

    // Reset for next round — Claude may produce more text after seeing tool results
    finalResponse = '';
  }

  callbacks?.onDone?.(finalResponse);

  return {
    response: finalResponse,
    messages,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
  };
}

/**
 * Run a single-turn agent call (no conversation history).
 * Convenience wrapper for simple one-shot requests.
 */
export async function askAgent(
  member: TeamMember,
  question: string
): Promise<{ response: string; toolCalls?: AgentMessage['toolCalls'] }> {
  const { response, toolCalls } = await runAgent(member, [], question);
  return { response, toolCalls };
}
