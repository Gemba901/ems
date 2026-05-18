'use client';

import { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface Props {
  onTranscript: (text: string) => void;
}

export function VoiceInput({ onTranscript }: Props) {
  const [listening, setListening] = useState(false);

  const toggle = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert('Speech recognition is not supported in this browser.');

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
      setListening(false);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    setListening(true);
    recognition.start();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`p-2 rounded-full transition-colors ${
        listening ? 'bg-red-100 text-red-600' : 'text-slate-400 hover:text-blue-600'
      }`}
      title={listening ? 'Listening...' : 'Speak'}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}
