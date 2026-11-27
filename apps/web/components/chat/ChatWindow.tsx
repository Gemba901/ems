'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { sendMessage } from '@/services/chat.service';
import { ChatMessage } from './ChatMessage';
import { VoiceInput } from './VoiceInput';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
          <p className="text-center text-muted-foreground text-sm mt-8">
            Hi {user?.name?.split(' ')[0]}! How can I help you today?
          </p>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-muted-foreground">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-3 flex items-center gap-2">
        <VoiceInput onTranscript={(t) => submit(t)} />
        <Input
          className="flex-1 text-sm bg-muted border border-border rounded-full px-4 py-2 outline-none focus:border-ring"
          placeholder="Ask anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <Button variant="ghost"
          onClick={() => submit()}
          disabled={!input.trim() || isLoading}
          className="p-2 rounded-full bg-info text-info-foreground hover:bg-info disabled:opacity-40 transition-colors h-auto whitespace-normal"
        >
          <Send size={14} />
        </Button>
      </div>
    </div>
  );
}
