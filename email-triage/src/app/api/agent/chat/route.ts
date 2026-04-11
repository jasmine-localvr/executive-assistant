import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { runAgent } from '@/lib/agent';
import type Anthropic from '@anthropic-ai/sdk';
import type { TeamMember } from '@/types';

/**
 * Strip base64 image data from Anthropic messages before persisting.
 * Browser tool results include screenshots that are useful for the current turn
 * but should NOT be stored in the database (too large, wastes tokens on reload).
 */
function stripScreenshotsFromMessages(
  messages: Anthropic.MessageParam[]
): Anthropic.MessageParam[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return messages.map((msg: any) => {
    if (!Array.isArray(msg.content)) return msg;

    const cleaned = msg.content.map((block: Record<string, unknown>) => {
      // Strip images from tool_result content arrays (browser screenshots)
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        const filtered = (block.content as Record<string, unknown>[]).filter(
          (b) => b.type !== 'image'
        );
        return { ...block, content: filtered.length > 0 ? filtered : '{}' };
      }
      return block;
    });

    return { ...msg, content: cleaned };
  }) as Anthropic.MessageParam[];
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { message, images, conversationId, stream: useStream } = body as {
      message: string;
      images?: { base64: string; mediaType: string }[];
      conversationId?: string;
      stream?: boolean;
    };

    if (!message?.trim() && (!images || images.length === 0)) {
      return NextResponse.json({ error: 'Message or image is required' }, { status: 400 });
    }

    // Load team member
    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', session.user.teamMemberId)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Load conversation history if continuing an existing conversation
    let history: Anthropic.MessageParam[] = [];
    let activeConversationId = conversationId;

    if (activeConversationId) {
      const { data: conv } = await supabase
        .from('agent_conversations')
        .select('messages')
        .eq('id', activeConversationId)
        .eq('team_member_id', session.user.teamMemberId)
        .single();

      if (conv?.messages) {
        history = conv.messages as Anthropic.MessageParam[];
      }
    }

    // ── Streaming mode ──
    if (useStream) {
      const encoder = new TextEncoder();
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      const send = async (event: string, data: unknown) => {
        await writer.write(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Fire-and-forget: run agent in background while response streams to client
      const teamMemberId = session.user.teamMemberId;
      (async () => {
        try {
          const result = await runAgent(
            member as TeamMember,
            history,
            message?.trim() || '',
            {
              onToolCall: (name) => { send('tool_call', { name }); },
              onToolResult: (name, res) => {
                send('tool_result', { name, success: (res as { success?: boolean }).success });
              },
              onText: (text) => { send('text', { text }); },
            },
            images
          );

          // Save conversation
          const persistableMessages = stripScreenshotsFromMessages(result.messages);

          if (activeConversationId) {
            await supabase
              .from('agent_conversations')
              .update({
                messages: persistableMessages,
                updated_at: new Date().toISOString(),
                message_count: persistableMessages.length,
              })
              .eq('id', activeConversationId);
          } else {
            const title = message.trim().slice(0, 100);
            const { data: newConv } = await supabase
              .from('agent_conversations')
              .insert({
                team_member_id: teamMemberId,
                title,
                messages: persistableMessages,
                message_count: persistableMessages.length,
              })
              .select('id')
              .single();
            activeConversationId = newConv?.id;
          }

          await send('done', {
            response: result.response,
            conversationId: activeConversationId,
            toolCalls: result.toolCalls,
          });
        } catch (err) {
          await send('error', {
            error: err instanceof Error ? err.message : 'Agent failed',
          });
        } finally {
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // ── Non-streaming mode (backwards compatible) ──
    const result = await runAgent(
      member as TeamMember,
      history,
      message?.trim() || '',
      undefined,
      images
    );

    // Save/update conversation (strip screenshots to keep JSONB size manageable)
    const persistableMessages = stripScreenshotsFromMessages(result.messages);

    if (activeConversationId) {
      await supabase
        .from('agent_conversations')
        .update({
          messages: persistableMessages,
          updated_at: new Date().toISOString(),
          message_count: persistableMessages.length,
        })
        .eq('id', activeConversationId);
    } else {
      const title = message.trim().slice(0, 100);
      const { data: newConv } = await supabase
        .from('agent_conversations')
        .insert({
          team_member_id: session.user.teamMemberId,
          title,
          messages: persistableMessages,
          message_count: persistableMessages.length,
        })
        .select('id')
        .single();

      activeConversationId = newConv?.id;
    }

    return NextResponse.json({
      response: result.response,
      conversationId: activeConversationId,
      toolCalls: result.toolCalls,
    });
  } catch (err) {
    console.error('[Agent] Chat error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Agent failed' },
      { status: 500 }
    );
  }
}
