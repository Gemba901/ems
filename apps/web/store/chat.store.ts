import { create } from 'zustand';
import { ChatMessage } from '@/services/chat.service';

interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  open: () => void;
  close: () => void;
  addMessage: (msg: ChatMessage) => void;
  setLoading: (val: boolean) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  messages: [],
  isLoading: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setLoading: (val) => set({ isLoading: val }),
  clear: () => set({ messages: [] }),
}));
