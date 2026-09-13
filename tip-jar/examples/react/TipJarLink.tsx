"use client";
// A footer link that opens the tip jar. The jar stays mounted so an in-flight tip survives
// closing and reopening it. Import "@venturalabs.ai/allways-tip-jar/styles.css" once at your app root.
import { useState } from "react";
import { TipJar } from "@venturalabs.ai/allways-tip-jar/react";

export function TipJarLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Tip jar
      </button>
      <TipJar
        open={open}
        onClose={() => setOpen(false)}
        // Vite: import.meta.env.VITE_TURNSTILE_SITE_KEY · Next.js: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        turnstileSiteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
        defaultCoin="sol"
      />
    </>
  );
}
