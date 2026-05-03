"use client";

import { createContext, useCallback, useContext, useState, useRef } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info";

interface Toast {
    id: string;
    message: string;
    variant: ToastVariant;
}

interface ToastContextValue {
    toast: (message: string, variant?: ToastVariant) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

// ── Config ────────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, { container: string; icon: React.ElementType; iconClass: string }> = {
    success: {
        container: "bg-white border-emerald-200 shadow-emerald-100/60",
        icon: CheckCircle2,
        iconClass: "text-emerald-500",
    },
    error: {
        container: "bg-white border-red-200 shadow-red-100/60",
        icon: XCircle,
        iconClass: "text-red-500",
    },
    info: {
        container: "bg-white border-indigo-200 shadow-indigo-100/60",
        icon: Info,
        iconClass: "text-indigo-500",
    },
};

const DURATION_MS = 4000;

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const timer = timers.current.get(id);
        if (timer) { clearTimeout(timer); timers.current.delete(id); }
    }, []);

    const toast = useCallback((message: string, variant: ToastVariant = "info") => {
        const id = `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
        const timer = setTimeout(() => dismiss(id), DURATION_MS);
        timers.current.set(id, timer);
    }, [dismiss]);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Toast container */}
            <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none" aria-live="polite">
                {toasts.map((t) => {
                    const cfg = VARIANT_STYLES[t.variant];
                    const Icon = cfg.icon;
                    return (
                        <div
                            key={t.id}
                            className={`pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-sm border rounded-xl px-4 py-3.5 shadow-lg animate-in slide-in-from-bottom-2 fade-in ${cfg.container}`}
                        >
                            <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.iconClass}`} />
                            <p className="text-sm text-slate-800 font-medium flex-1 leading-snug">{t.message}</p>
                            <button
                                onClick={() => dismiss(t.id)}
                                className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast() {
    return useContext(ToastContext);
}
