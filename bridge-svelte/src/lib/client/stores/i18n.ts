/**
 * Translator access for the SDK auth components (TBP-630).
 *
 * Reads `locale` / `messages` off BridgeConfig so an app sets the language ONCE
 * at bootstrap rather than passing it to every component, and layers a
 * component-level `messages` prop on top for per-screen wording.
 */
import { createTranslator, type MessageOverrides, type Translator } from '@nebulr-group/bridge-auth-core';
import { getConfig } from './config.store.js';

/**
 * Build a translator from config, with an optional per-component override.
 *
 * `getConfig()` throws when bootstrap has not run. These components can render
 * before that in a test harness or a stray import, and a login form that throws
 * because nobody called `initConfig` is a worse failure than one rendered in
 * English — so the catch falls back to the default (English) translator rather
 * than propagating.
 */
export function getTranslator(messages?: MessageOverrides): Translator {
  try {
    const { locale, messages: configMessages } = getConfig();
    return createTranslator({
      locale,
      messages: { ...configMessages, ...messages },
    });
  } catch {
    return createTranslator({ messages });
  }
}
