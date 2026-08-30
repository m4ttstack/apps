/** Advances the human's read cursor for a room. Callers refetch rooms only
    after this resolves: the count clears server-side first, and a refetch
    fired earlier would read the stale unread. */
export function postMarkRead(room: string): Promise<Response> {
  return fetch('/api/chat/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room }),
  });
}
