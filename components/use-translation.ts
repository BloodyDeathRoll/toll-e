'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// On-device translation, via Chrome's built-in Translator API.
//
// The provider publishes company descriptions in English only — it answers
// with the same text whatever `lang` you ask it for — so a Hebrew reader gets
// an English paragraph unless something translates it. This does it in the
// browser: no key, no server round trip, and the text never leaves the device.
//
// Where the API is missing (every non-Chromium browser today) the original
// simply stays put.
//
// What comes out is handed back through `onTranslated`, so the caller can
// store it: one reader's translation is every later reader's Hebrew, on any
// browser. Nobody is asked to press anything — the page translates itself.

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
 * - `working` — downloading and/or translating.
 * - `done` — `translated` holds the text.
 * - `failed` — the original is still there, and stays.
 */
export type TranslateState = 'unsupported' | 'working' | 'done' | 'failed';

/** Translations survive navigation within the session; they are not cheap. */
const memo = new Map<string, string>();

export function useOnDeviceTranslation(
  text: string | undefined,
  targetLanguage: string,
  /** Called once with each fresh translation — the caller stores it. */
  onTranslated?: (translated: string) => void,
  sourceLanguage = 'en',
) {
  const [state, setState] = useState<TranslateState>('unsupported');
  const [translated, setTranslated] = useState<string>();
  const key = text ? `${sourceLanguage}>${targetLanguage}:${text}` : '';

  // A ref, not a dep: the caller passes a fresh closure every render, and a
  // callback identity must not be what re-runs a translation.
  const report = useRef(onTranslated);
  useEffect(() => {
    report.current = onTranslated;
  }, [onTranslated]);

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
      report.current?.(out);
    } catch {
      // Chrome wants a user gesture before it downloads a model, and there is
      // no gesture here by design. That throw is indistinguishable from any
      // other failure, and the answer to all of them is the same: leave the
      // English paragraph alone.
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
      // Anything short of a flat 'unavailable' is worth attempting. A model
      // that still has to come down may refuse without a user gesture — then
      // it fails quietly, and the first reader whose browser is ready fills
      // the store for everyone else.
      if (can !== 'unavailable') void run();
    })();

    return () => {
      alive = false;
    };
  }, [key, text, sourceLanguage, targetLanguage, run]);

  return { state, translated, translate: run };
}
