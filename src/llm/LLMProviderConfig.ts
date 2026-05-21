export type LLMProvider = 'lmstudio-rest' | 'openai-compatible' | 'openai' | 'anthropic' | 'gemini';

export type LLMProviderConfig = {
  provider: LLMProvider;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export const DEFAULT_LM_STUDIO_CONFIG: LLMProviderConfig = {
  provider: 'lmstudio-rest',
  baseUrl: '/lmstudio',
  model: 'google/gemma-3-4b',
  apiKey: 'not-needed',
  temperature: 0.4,
  maxTokens: 400,
  timeoutMs: 12000,
};

export function isLlmProvider(value: string | null | undefined): value is LLMProvider {
  return value === 'lmstudio-rest' || value === 'openai-compatible' || value === 'openai' || value === 'anthropic' || value === 'gemini';
}

export function shouldPreferLmStudioRest(provider: LLMProviderConfig['provider'], baseUrl: string | undefined): boolean {
  if (provider !== 'openai-compatible') {
    return false;
  }

  const value = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (value === '/lmstudio/v1') {
    return true;
  }

  try {
    const url = new URL(value);
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '1234';
  } catch {
    return false;
  }
}

export function normalizeLlmBaseUrl(baseUrl: string | undefined, provider: LLMProviderConfig['provider']): string {
  const fallback = provider === 'openai-compatible' ? '/lmstudio/v1' : (DEFAULT_LM_STUDIO_CONFIG.baseUrl ?? '/lmstudio');
  const value = (baseUrl ?? fallback).trim().replace(/\/+$/, '');

  if (!value) {
    return fallback;
  }

  try {
    const url = new URL(value);
    const isLocalLmStudio = (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '1234';
    if (isLocalLmStudio) {
      return provider === 'openai-compatible' ? '/lmstudio/v1' : '/lmstudio';
    }
  } catch {
    // Relative URLs such as /lmstudio are already browser-safe.
  }

  return value;
}
