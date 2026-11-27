'use client';

import { MessageCircle, X } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';
import { ChatWindow } from './ChatWindow';
import { Button } from "@/components/ui/button";

export function ChatWidget() {
  const { isOpen, open, close } = useChatStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-80 h-[480px] bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-info">
            <span className="text-primary-foreground font-medium text-sm">Gemba Assistant</span>
            <Button variant="ghost" onClick={close} className="text-primary-foreground/70 hover:text-primary-foreground h-auto whitespace-normal">
              <X size={16} />
            </Button>
          </div>
          <ChatWindow />
        </div>
      )}

      <Button variant="ghost"
        onClick={isOpen ? close : open}
        className="h-12 w-12 rounded-full bg-info text-info-foreground shadow-lg hover:bg-info transition-colors flex items-center justify-center whitespace-normal"
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
      </Button>
    </div>
  );
}
