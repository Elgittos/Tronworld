import { LLMClient, LLMCompletionResult, LLMMessage } from './LLMClient';
import { DEFAULT_LM_STUDIO_CONFIG, LLMProviderConfig, normalizeLlmBaseUrl } from './LLMProviderConfig';

type LMStudioChatResponse = {
  output?: Array<{
    type?: string;
    content?: string;
  }>;
  error?: {
    message?: string;
  };
};

type LMStudioModelListResponse = {
  models?: Array<{
    type?: string;
    key?: string;
    selected_variant?: string;
    loaded_instances?: Array<{
      id?: string;
    }>;
  }>;
};

function toUserInput(messages: LLMMessage[]): { systemPrompt: string; input: string } {
  const systemPrompt = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');

  const input = messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n');

  return { systemPrompt, input };
}

export class LMStudioRestClient implements LLMClient {
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig = DEFAULT_LM_STUDIO_CONFIG) {
    this.config = { ...DEFAULT_LM_STUDIO_CONFIG, ...config };
  }

  async completeChat(messages: LLMMessage[]): Promise<LLMCompletionResult> {
    const baseUrl = normalizeLlmBaseUrl(this.config.baseUrl, 'lmstudio-rest');
    const { systemPrompt, input } = toUserInput(messages);
    return this.completeChatWithModel(baseUrl, this.config.model ?? DEFAULT_LM_STUDIO_CONFIG.model, systemPrompt, input, true);
  }

  private async completeChatWithModel(
    baseUrl: string,
    model: string | undefined,
    systemPrompt: string,
    input: string,
    allowModelRetry: boolean,
  ): Promise<LLMCompletionResult> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.config.timeoutMs ?? 12000);

    try {
      const response = await fetch(`${baseUrl}/api/v1/chat`, {
        method: 'POST',
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify({
          model,
          system_prompt: systemPrompt,
          input,
          temperature: this.config.temperature ?? 0.4,
          max_output_tokens: this.config.maxTokens ?? 400,
          store: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (allowModelRetry && this.isModelNotFound(errorText)) {
          const resolvedModel = await this.resolveLoadedModel(baseUrl);
          if (resolvedModel && resolvedModel !== model) {
            this.config = { ...this.config, model: resolvedModel };
            return this.completeChatWithModel(baseUrl, resolvedModel, systemPrompt, input, false);
          }
        }
        return { ok: false, error: `HTTP ${response.status}: ${this.humanReadableError(errorText)}` };
      }

      const data = (await response.json()) as LMStudioChatResponse;
      const content = data.output
        ?.filter((item) => item.type === 'message' && typeof item.content === 'string')
        .map((item) => item.content)
        .join('\n')
        .trim();

      if (!content) {
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

  private async resolveLoadedModel(baseUrl: string): Promise<string | undefined> {
    try {
      const response = await fetch(`${baseUrl}/api/v1/models`, {
        headers: this.headers(),
      });
      if (!response.ok) {
        return undefined;
      }

      const data = (await response.json()) as LMStudioModelListResponse;
      const llms = (data.models ?? []).filter((model) => model.type === 'llm');
      const loaded = llms.find((model) => (model.loaded_instances?.length ?? 0) > 0) ?? llms[0];
      return loaded?.loaded_instances?.[0]?.id ?? loaded?.key ?? loaded?.selected_variant;
    } catch {
      return undefined;
    }
  }

  private isModelNotFound(errorText: string): boolean {
    return errorText.includes('model_not_found') || errorText.includes('Invalid model identifier');
  }

  private humanReadableError(errorText: string): string {
    try {
      const parsed = JSON.parse(errorText) as { error?: { message?: string; code?: string } };
      if (parsed.error?.message) {
        return parsed.error.code ? `${parsed.error.message} (${parsed.error.code})` : parsed.error.message;
      }
    } catch {
      // Keep the original server text when it is not JSON.
    }
    return errorText;
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
