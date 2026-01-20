"use client";

import { useEffect, useRef } from "react";

interface ErrorAlertProps {
  readonly error: string | null;
  readonly onDismiss?: () => void;
  readonly autoCloseDuration?: number;
}

export function ErrorAlert({ error, onDismiss, autoCloseDuration = 5000 }: ErrorAlertProps) {
  const dismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (error && autoCloseDuration > 0) {
      dismissTimeoutRef.current = setTimeout(() => {
        onDismiss?.();
      }, autoCloseDuration);
      return () => {
        if (dismissTimeoutRef.current) {
          clearTimeout(dismissTimeoutRef.current);
        }
      };
    }
  }, [error, autoCloseDuration, onDismiss]);

  if (!error) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md rounded-lg border border-red-500/30 bg-red-500/10 backdrop-blur-sm p-4 animate-in fade-in slide-in-from-top-2">
      <div className="flex gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <ErrorIcon className="h-5 w-5 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-red-600 font-medium break-words">{error}</p>
        </div>
        <button
          onClick={onDismiss}
          className="ml-2 flex-shrink-0 text-red-600/60 hover:text-red-600 transition-colors"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ErrorIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4m0 4v.01" />
    </svg>
  );
}

function CloseIcon({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6l-12 12M6 6l12 12" />
    </svg>
  );
}
