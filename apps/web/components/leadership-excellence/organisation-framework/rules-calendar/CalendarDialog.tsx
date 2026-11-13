"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./rules-calendar.module.css";

/** A visible, keyboard-accessible decision, independent of the page's scroll position. */
export function CalendarDialog({
  title,
  children,
  onCancel,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const origin = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.decisionDialog}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}
