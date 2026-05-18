export type LLMProviderConfig = {
  provider: 'openai-compatible' | 'openai' | 'anthropic' | 'gemini' | 'scripted';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export const DEFAULT_LM_STUDIO_CONFIG: LLMProviderConfig = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:1234/v1',
  model: 'local-model',
  apiKey: 'not-needed',
  temperature: 0.4,
  maxTokens: 400,
  timeoutMs: 12000,
};
