// Temporary test endpoint — simulates the agent chat streaming pattern
export async function GET() {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    // Simulate: agent calls browser_navigate
    await writer.write(
      encoder.encode(`event: tool_call\ndata: {"name":"browser_navigate"}\n\n`)
    );

    // Simulate: browser navigates (3 second delay)
    await new Promise((r) => setTimeout(r, 3000));

    await writer.write(
      encoder.encode(`event: tool_result\ndata: {"name":"browser_navigate","success":true}\n\n`)
    );

    // Simulate: Claude processes screenshot (2 second delay)
    await new Promise((r) => setTimeout(r, 2000));

    // Simulate: agent calls browser_click
    await writer.write(
      encoder.encode(`event: tool_call\ndata: {"name":"browser_click"}\n\n`)
    );

    await new Promise((r) => setTimeout(r, 2000));

    await writer.write(
      encoder.encode(`event: tool_result\ndata: {"name":"browser_click","success":true}\n\n`)
    );

    await new Promise((r) => setTimeout(r, 2000));

    // Final response
    await writer.write(
      encoder.encode(
        `event: done\ndata: ${JSON.stringify({
          response: 'I opened the Colorado DMV website. I can see the vehicle registration renewal page. What is your verification code?',
          conversationId: 'test-123',
          toolCalls: [
            { name: 'browser_navigate', input: { url: 'https://mydmv.colorado.gov' }, result: {} },
            { name: 'browser_click', input: { element_index: 3 }, result: {} },
          ],
        })}\n\n`
      )
    );

    await writer.close();
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
