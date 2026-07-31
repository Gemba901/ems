"use client";

import { useCallback, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

type DwmsVoiceInputButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export default function DwmsVoiceInputButton({ onTranscript, disabled }: DwmsVoiceInputButtonProps) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
  );
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const clearStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    clearStream();
    setListening(false);
  }, [clearStream]);

  const start = useCallback(async () => {
    if (disabled || listening) return;
    setError(null);

    if (!window.isSecureContext) {
      setError('Voice input needs HTTPS or localhost.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not available in this browser.');
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : 'MicrophoneError';
      setError(
        name === 'NotAllowedError'
          ? 'Microphone permission is blocked.'
          : name === 'NotFoundError'
            ? 'No microphone was found.'
            : `Microphone failed: ${name}`,
      );
      return;
    }

    const SpeechRecognitionConstructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length - event.resultIndex },
        (_, index) => event.results[event.resultIndex + index][0].transcript,
      )
        .join(' ')
        .trim();

      if (transcript) onTranscript(transcript);
    };

    recognition.onerror = (event) => {
      recognitionRef.current = null;
      clearStream();
      setListening(false);
      setError(
        event.error === 'no-speech'
          ? 'No speech detected. Try again after the red mic appears.'
          : event.error === 'audio-capture'
            ? 'Browser cannot capture microphone audio.'
            : event.error === 'not-allowed'
              ? 'Microphone permission is blocked.'
              : event.error === 'network'
                ? 'Speech service network error.'
                : `Speech failed: ${event.error}`,
      );
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      clearStream();
      setListening(false);
    };

    recognitionRef.current = recognition;
    setListening(true);

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      clearStream();
      setListening(false);
      setError('Speech recognition could not start.');
    }
  }, [clearStream, disabled, listening, onTranscript]);

  if (!supported) return null;

  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-label={listening ? 'Stop voice input' : 'Start voice input'}
        title={error ?? (listening ? 'Stop voice input' : 'Start voice input')}
        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border shadow-sm transition-all ${
          listening
            ? 'animate-pulse border-red-300 bg-red-50 text-red-600'
            : error
              ? 'border-amber-300 bg-amber-50 text-amber-600 hover:border-amber-400'
              : 'border-slate-200 bg-white text-slate-400 hover:border-blue-300 hover:text-blue-600'
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
      </button>
      {error && <span className="max-w-44 text-[11px] leading-tight text-amber-700">{error}</span>}
    </div>
  );
}
