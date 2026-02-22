"use client";

import { useEffect, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  useSpeech – robust Web Speech API wrapper for React                */
/*                                                                     */
/*  • voiceschanged handling  (iOS loads voices async)                 */
/*  • explicit de-DE voice selection (prefer local/offline voice)      */
/*  • cleanup / cancel on unmount                                      */
/*  • iOS "unlock" pattern (silent utterance on first user gesture)    */
/* ------------------------------------------------------------------ */

/** Pick the best German voice, preferring local/offline voices */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const deVoices = voices.filter(
    (v) => v.lang === "de-DE" || v.lang.startsWith("de-DE") || v.lang === "de",
  );
  // Prefer local (non-network) voices — they work offline and are faster
  const local = deVoices.find((v) => v.localService);
  if (local) return local;
  // Fallback: any German voice
  if (deVoices.length > 0) return deVoices[0];
  // Last resort: null → browser default
  return null;
}

export interface SpeakOptions {
  text: string;
  onEnd?: () => void;
  onError?: () => void;
}

export function useSpeech() {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const unlockedRef = useRef(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  /* ---- Resolve voices (handles async loading on iOS/WebKit) ---- */
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const synth = window.speechSynthesis;

    const resolve = () => {
      const voices = synth.getVoices();
      if (voices.length > 0) {
        voiceRef.current = pickVoice(voices);
      }
    };

    // Try immediately (Chrome populates synchronously)
    resolve();

    // iOS/WebKit fires voiceschanged when ready
    synth.addEventListener("voiceschanged", resolve);
    return () => synth.removeEventListener("voiceschanged", resolve);
  }, []);

  /* ---- iOS unlock: silent utterance on first user gesture ---- */
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (unlockedRef.current) return;

    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      // Speak an empty utterance to "warm up" the audio context
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      window.speechSynthesis.speak(u);
      // Clean up listeners
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* ---- Cancel on unmount ---- */
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  /* ---- speak() ---- */
  const speak = useCallback(({ text, onEnd, onError }: SpeakOptions) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      onError?.();
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel(); // stop any running utterance

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "de-DE";
    utter.rate = 1;
    if (voiceRef.current) {
      utter.voice = voiceRef.current;
    }

    utter.onend = () => {
      utterRef.current = null;
      onEnd?.();
    };
    utter.onerror = () => {
      utterRef.current = null;
      onError?.();
    };

    utterRef.current = utter;
    synth.speak(utter);
  }, []);

  /* ---- cancel() ---- */
  const cancel = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utterRef.current = null;
  }, []);

  return { speak, cancel };
}
