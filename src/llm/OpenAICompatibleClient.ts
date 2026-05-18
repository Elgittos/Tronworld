import { LLMClient, LLMCompletionResult, LLMMessage } from './LLMClient';
import { DEFAULT_LM_STUDIO_CONFIG, LLMProviderConfig } from './LLMProviderConfig';

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class OpenAICompatibleClient implements LLMClient {
  private readonly config: LLMProviderConfig;

  constructor(config: LLMProviderConfig = DEFAULT_LM_STUDIO_CONFIG) {
    this.config = { ...DEFAULT_LM_STUDIO_CONFIG, ...config };
  }

  async completeChat(messages: LLMMessage[]): Promise<LLMCompletionResult> {
    const baseUrl = (this.config.baseUrl ?? DEFAULT_LM_STUDIO_CONFIG.baseUrl ?? '').replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.config.timeoutMs ?? 12000);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model ?? 'local-model',
          messages,
          temperature: this.config.temperature ?? 0.4,
          max_tokens: this.config.maxTokens ?? 400,
        }),
      });

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}: ${await response.text()}` };
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || content.trim().length === 0) {
        return { ok: false, error: data.error?.message ?? 'Model returned an empty response.' };
      }

      return { ok: true, content };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, error: 'Model request timed out.' };
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Model request failed.' };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey && this.config.apiKey !== 'not-needed') {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }
}
