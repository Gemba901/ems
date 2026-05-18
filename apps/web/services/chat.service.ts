const API_URL = process.env.NEXT_PUBLIC_API_URL;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendMessage(messages: ChatMessage[], token: string): Promise<string> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) throw new Error('Failed to send message');
  const data = await res.json();
  return data.reply;
}
