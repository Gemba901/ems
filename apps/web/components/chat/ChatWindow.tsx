'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { sendMessage } from '@/services/chat.service';
import { ChatMessage } from './ChatMessage';
import { VoiceInput } from './VoiceInput';

export function ChatWindow() {
  const { messages, isLoading, addMessage, setLoading } = useChatStore();
  const { accessToken, user } = useAuthStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isLoading || !accessToken) return;

    const userMsg = { role: 'user' as const, content };
    addMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      const reply = await sendMessage([...messages, userMsg], accessToken);
      addMessage({ role: 'assistant', content: reply });
    } catch {
      addMessage({ role: 'assistant', content: 'Sorry, something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-slate-400 text-sm mt-8">
            Hi {user?.name?.split(' ')[0]}! How can I help you today?
          </p>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-slate-400">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-100 p-3 flex items-center gap-2">
        <VoiceInput onTranscript={(t) => submit(t)} />
        <input
          className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-full px-4 py-2 outline-none focus:border-blue-400"
          placeholder="Ask anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button
          onClick={() => submit()}
          disabled={!input.trim() || isLoading}
          className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
