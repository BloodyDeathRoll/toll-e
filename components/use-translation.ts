'use client';

import { useCallback, useEffect, useState } from 'react';

// On-device translation, via Chrome's built-in Translator API.
//
// The provider publishes company descriptions in English only — it answers
// with the same text whatever `lang` you ask it for — so a Hebrew reader gets
// an English paragraph unless something translates it. This does it in the
// browser: no key, no server round trip, and the text never leaves the device.
//
// Where the API is missing (every non-Chromium browser today) the original
// simply stays put. That is the whole fallback, and it is a fine one.

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface TranslatorInstance {
  translate(text: string): Promise<string>;
  destroy?: () => void;
}

interface TranslatorPair {
  sourceLanguage: string;
  targetLanguage: string;
}

interface TranslatorFactory {
  availability(pair: TranslatorPair): Promise<Availability>;
  create(pair: TranslatorPair & { monitor?: (m: EventTarget) => void }): Promise<TranslatorInstance>;
}

declare global {
  interface Window {
    Translator?: TranslatorFactory;
  }
}

/**
 * - `unsupported` — no Translator, or no model for this pair. Show nothing.
 * - `idle` — translatable, but the model has to come down first, and the API
 *   only allows that from a user gesture. Offer a button.
 * - `working` — downloading and/or translating.
 * - `done` — `translated` holds the text.
 * - `failed` — offer the button again; the original is still there.
 */
export type TranslateState = 'unsupported' | 'idle' | 'working' | 'done' | 'failed';

/** Translations survive navigation within the session; they are not cheap. */
const memo = new Map<string, string>();

export function useOnDeviceTranslation(
  text: string | undefined,
  targetLanguage: string,
  sourceLanguage = 'en',
) {
  const [state, setState] = useState<TranslateState>('unsupported');
  const [translated, setTranslated] = useState<string>();
  const key = text ? `${sourceLanguage}>${targetLanguage}:${text}` : '';

  const run = useCallback(async () => {
    const factory = window.Translator;
    if (!text || !factory) return;
    setState('working');
    try {
      const translator = await factory.create({ sourceLanguage, targetLanguage });
      const out = await translator.translate(text);
      translator.destroy?.();
      memo.set(key, out);
      setTranslated(out);
      setState('done');
    } catch {
      setState('failed');
    }
  }, [text, key, sourceLanguage, targetLanguage]);

  useEffect(() => {
    let alive = true;
    if (!text || sourceLanguage === targetLanguage) {
      queueMicrotask(() => alive && setState('unsupported'));
      return () => {
        alive = false;
      };
    }
    const cached = memo.get(key);
    if (cached) {
      queueMicrotask(() => {
        if (!alive) return;
        setTranslated(cached);
        setState('done');
      });
      return () => {
        alive = false;
      };
    }

    (async () => {
      const factory = window.Translator;
      if (!factory) return;
      const can = await factory.availability({ sourceLanguage, targetLanguage }).catch(
        () => 'unavailable' as const,
      );
      if (!alive) return;
      // Already downloaded: translate straight away, no button, no ceremony.
      if (can === 'available') void run();
      // Needs the model. `create()` wants a user gesture for that, so ask.
      else if (can === 'downloadable' || can === 'downloading') setState('idle');
    })();

    return () => {
      alive = false;
    };
  }, [key, text, sourceLanguage, targetLanguage, run]);

  return { state, translated, translate: run };
}
