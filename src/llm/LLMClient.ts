export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LLMCompletionResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

export interface LLMClient {
  completeChat(messages: LLMMessage[]): Promise<LLMCompletionResult>;
}
