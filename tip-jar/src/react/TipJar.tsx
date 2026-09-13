"use client";
// The reference tip jar: a native <dialog>, plain class names, no UI library, styles included.
// Theme it through the CSS variables (styles.ts), reword it through `copy`, or build your own
// on useTipJar. Keep it mounted and toggle `open`: closing and reopening keeps an in-flight tip.
import { useEffect, useInsertionEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { defaultCopy, describeError, endedMessage, type TipJarCopy } from "./copy.js";
import { clock, formatAmount, shorten } from "./format.js";
import { ensureStyles } from "./styles.js";
import { Turnstile } from "./Turnstile.js";
import { isThanked, useTipJar, type TipJarState } from "./useTipJar.js";

export interface TipJarProps {
  open: boolean;
  onClose: () => void;
  endpoint?: string; // where the server handler is mounted. Default "/api/tip".
  turnstileSiteKey?: string; // public Turnstile site key; omit only in local development
  defaultCoin?: string; // e.g. "sol"
  copy?: Partial<TipJarCopy>;
  className?: string;
  // The built-in palette: "auto" follows the visitor's system setting.
  theme?: "light" | "dark" | "auto";
  // Skip the built-in styles, to bring your own or to load "@venturalabs.ai/allways-tip-jar/styles.css".
  unstyled?: boolean;
  nonce?: string; // CSP nonce for the injected <style> tag
}

export function TipJar({
  open,
  onClose,
  endpoint,
  turnstileSiteKey,
  defaultCoin,
  copy: overrides,
  className,
  theme = "light",
  unstyled = false,
  nonce,
}: TipJarProps) {
  useInsertionEffect(() => {
    if (!unstyled) ensureStyles(document, nonce);
  }, [unstyled, nonce]);
  const copy: TipJarCopy = { ...defaultCopy, ...overrides };
  const jar = useTipJar({ endpoint, active: open, defaultCoin });
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const submit = async () => {
    await jar.submit(captcha);
    // Turnstile tokens are single-use.
    setCaptcha(null);
    setCaptchaRound((n) => n + 1);
  };

  return (
    <dialog
      ref={dialog}
      className={className ? `tipjar ${className}` : "tipjar"}
      data-theme={theme}
      aria-labelledby="tipjar-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // backdrop click
      }}
    >
      <div className="tipjar__panel">
        <div className="tipjar__header">
          <h2 id="tipjar-title" className="tipjar__title">
            {copy.title}
          </h2>
          <button
            type="button"
            className="tipjar__close"
            aria-label={copy.close}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {jar.optionsError ? (
          <p className="tipjar__alert" role="alert">
            {jar.optionsError.message}
          </p>
        ) : !jar.options ? (
          <div className="tipjar__center">
            <Spinner />
          </div>
        ) : jar.phase !== "form" ? (
          <Deposit jar={jar} copy={copy} />
        ) : (
          <>
            <label className="tipjar__field">
              <span className="tipjar__label">{copy.coinLabel}</span>
              <select
                className="tipjar__input"
                value={jar.coin}
                onChange={(e) => jar.pickCoin(e.target.value)}
              >
                {jar.options.coins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.symbol} · {c.network}
                  </option>
                ))}
              </select>
            </label>

            {jar.direct ? (
              <>
                <p className="tipjar__text">{copy.direct(jar.symbol)}</p>
                <PayTo address={jar.options.payoutAddress} copy={copy} />
              </>
            ) : (
              <>
                <AmountField jar={jar} copy={copy} />
                <label className="tipjar__field">
                  <span className="tipjar__label">
                    {copy.fromAddressLabel(jar.symbol)}
                  </span>
                  <input
                    className="tipjar__input tipjar__mono"
                    value={jar.fromAddress}
                    onChange={(e) => jar.setFromAddress(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <span className="tipjar__hint">{copy.fromAddressHint}</span>
                </label>
                {turnstileSiteKey && open && (
                  <Turnstile
                    key={captchaRound}
                    siteKey={turnstileSiteKey}
                    onToken={setCaptcha}
                  />
                )}
                {jar.error && (
                  <p className="tipjar__alert" role="alert">
                    {describeError(jar.error, jar.symbol, copy)}
                  </p>
                )}
                <button
                  type="button"
                  className="tipjar__button"
                  onClick={submit}
                  disabled={!jar.ready || (!!turnstileSiteKey && captcha === null)}
                >
                  {jar.busy ? <Spinner /> : copy.submit}
                </button>
              </>
            )}
          </>
        )}

        <p className="tipjar__footer">
          {copy.poweredBy}{" "}
          <a href="https://all-ways.io" target="_blank" rel="noopener noreferrer">
            Allways
          </a>
        </p>
      </div>
    </dialog>
  );
}

function AmountField({ jar, copy }: { jar: TipJarState; copy: TipJarCopy }) {
  const invalid = jar.quote !== null && !jar.amountInRange && jar.amount !== "";
  const hint = jar.quoteError
    ? describeError(jar.quoteError, jar.symbol, copy)
    : !jar.quote
      ? copy.checkingRange
      : copy.range(
          formatAmount(jar.quote.minFromAmount, "up"),
          formatAmount(jar.quote.maxFromAmount, "down"),
          jar.symbol,
        );
  return (
    <label className="tipjar__field">
      <span className="tipjar__label">{copy.amountLabel}</span>
      <span className="tipjar__input tipjar__input-row" aria-invalid={invalid}>
        <input
          className="tipjar__bare tipjar__mono"
          value={jar.amount}
          inputMode="decimal"
          onChange={(e) => jar.setAmount(e.target.value.replace(/[^\d.]/g, ""))}
        />
        <span className="tipjar__suffix">{jar.symbol}</span>
      </span>
      <span className={invalid ? "tipjar__hint tipjar__hint--error" : "tipjar__hint"}>
        {hint}
      </span>
    </label>
  );
}

function Deposit({ jar, copy }: { jar: TipJarState; copy: TipJarCopy }) {
  const { tip } = jar;
  if (!tip) return null;

  if (jar.phase === "ended")
    return (
      <div className="tipjar__center tipjar__stack">
        <p className="tipjar__text">{endedMessage(tip, copy)}</p>
        {!isThanked(tip) && (
          <button type="button" className="tipjar__link-button" onClick={jar.reset}>
            {copy.tryAgain}
          </button>
        )}
      </div>
    );

  if (jar.phase === "generating")
    return (
      <div className="tipjar__row">
        <Spinner />
        <p className="tipjar__text">{copy.generating}</p>
      </div>
    );

  return (
    <div className="tipjar__stack">
      <p className="tipjar__text">{copy.sendExactly}</p>
      <Copyable value={tip.fromAmount} suffix={jar.symbol} copy={copy} />
      <p className="tipjar__text">{copy.to}</p>
      <PayTo address={tip.depositAddress ?? ""} copy={copy} />
      <p className="tipjar__hint">
        {copy.from} <span className="tipjar__mono">{shorten(jar.fromAddress)}</span>
        {jar.secondsLeft !== null && !jar.expired && (
          <>
            , {copy.within} {clock(jar.secondsLeft)}
          </>
        )}
      </p>
      <div className="tipjar__row">
        {jar.expired ? (
          <p className="tipjar__text">{copy.windowClosed}</p>
        ) : (
          <>
            <Spinner />
            <p className="tipjar__text tipjar__muted">{copy.waiting}</p>
          </>
        )}
      </div>
      {/* Only a closed window needs a way out; an open one would just invite a second lock. */}
      {jar.expired && (
        <button type="button" className="tipjar__link-button" onClick={jar.reset}>
          {copy.tryAgain}
        </button>
      )}
    </div>
  );
}

// A plain address in the QR, not a payment URI: URI schemes differ per chain and token, and a
// wrong one could prefill the wrong amount or asset.
function PayTo({ address, copy }: { address: string; copy: TipJarCopy }) {
  return (
    <div className="tipjar__stack">
      <div className="tipjar__qr">
        <QRCodeSVG value={address} size={168} />
      </div>
      <Copyable value={address} copy={copy} />
    </div>
  );
}

function Copyable({
  value,
  suffix,
  copy,
}: {
  value: string;
  suffix?: string;
  copy: TipJarCopy;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure context; the value is still selectable.
    }
  };
  return (
    <div className="tipjar__copyable">
      <span className="tipjar__mono tipjar__value">
        {value}
        {suffix && ` ${suffix}`}
      </span>
      <button
        type="button"
        className="tipjar__copy"
        onClick={onCopy}
        aria-label={copied ? copy.copied : copy.copy}
      >
        {copied ? "✓" : copy.copy}
      </button>
    </div>
  );
}

const Spinner = () => <span className="tipjar__spinner" aria-hidden="true" />;
