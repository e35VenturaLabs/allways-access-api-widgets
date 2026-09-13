"use client";
// Cloudflare Turnstile, loaded only when the jar renders a form. Remount it (via `key`) after
// each lock attempt, since a token works once. `onToken` must be stable (a useState setter is).
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render(
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ): string;
      remove(widgetId: string): void;
    };
  }
}

export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | undefined;
    let cancelled = false;
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled || !ref.current) return;
        widget = turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      },
      () => onToken(null),
    );
    return () => {
      cancelled = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, onToken]);
  // With an invisible widget (set in the Cloudflare dashboard) this box stays empty.
  return <div ref={ref} className="tipjar__captcha" />;
}

let script: Promise<NonNullable<Window["turnstile"]>> | null = null;

function loadTurnstile() {
  script ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject());
    s.onerror = () => {
      script = null;
      reject();
    };
    document.head.appendChild(s);
  });
  return script;
}
