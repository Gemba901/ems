'use client';

import { MessageCircle, X } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';
import { ChatWindow } from './ChatWindow';

export function ChatWidget() {
  const { isOpen, open, close } = useChatStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-80 h-[480px] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-blue-600">
            <span className="text-white font-medium text-sm">Gemba Assistant</span>
            <button onClick={close} className="text-white/70 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <ChatWindow />
        </div>
      )}

      <button
        onClick={isOpen ? close : open}
        className="h-12 w-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </div>
  );
}
