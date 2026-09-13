import { loadConfig, loadSecrets } from '../../config.js';
import type { LLM } from './interface.js';
import { OpenAILLM } from './openai.js';

export type { LLM } from './interface.js';

let llmInstance: LLM | null = null;
let override: LLM | null = null;

function createLLM(): LLM {
  const config = loadConfig();

  if (config.llm.provider === 'openai') {
    const apiKey = loadSecrets().openai?.apiKey;
    if (!apiKey) throw new Error('OpenAI API key not found. Set openai.apiKey in your secrets file.');
    return new OpenAILLM(apiKey, config.llm.models);
  }

  throw new Error(`Unknown LLM provider: ${config.llm.provider}`);
}

export function getLLM(): LLM {
  if (override) return override;
  llmInstance ??= createLLM();
  return llmInstance;
}

/**
 * Substitute the LLM used by every service, for tests and local experiments.
 * Pass null to fall back to the configured provider.
 */
export function setLLM(llm: LLM | null): void {
  override = llm;
}
