import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import type { LLMTask } from './services/llm/interface.js';

export interface Config {
  port: number;
  database: {
    path: string;
  };
  llm: {
    provider: LLMProvider;
    models: TaskModels;
  };
  email: {
    /** Lower-cased addresses allowed to submit booking emails. */
    allowedSenders: string[];
  };
}

/** One model per {@link LLMTask}. */
export type TaskModels = Record<LLMTask, string>;

export type LLMProvider = 'openai';

export interface Secrets {
  openai?: {
    apiKey: string;
  };
  email?: {
    webhookSecret?: string;
  };
}

const CONFIG_PATH = './config.yml';

const DEFAULT_MODELS: Record<LLMProvider, TaskModels> = {
  openai: {
    extract: 'gpt-5.6-luna',
    match: 'gpt-5.6-luna',
  },
};

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const parsed = existsSync(CONFIG_PATH)
    ? (parse(readFileSync(CONFIG_PATH, 'utf-8')) as {
        port?: number;
        database?: { path?: string };
        llm?: { provider?: LLMProvider; models?: Partial<TaskModels> };
        email?: { allowed_senders?: string[] };
      } | null) ?? {}
    : {};

  const provider = parsed.llm?.provider ?? 'openai';
  if (!(provider in DEFAULT_MODELS)) {
    throw new Error(
      `Unknown LLM provider "${provider}". Supported providers: ${Object.keys(DEFAULT_MODELS).join(', ')}`,
    );
  }

  cachedConfig = {
    port: Number(process.env.PORT ?? parsed.port ?? 3000),
    database: {
      path: process.env.DATABASE_PATH ?? parsed.database?.path ?? './data/itinerary.db',
    },
    llm: {
      provider,
      models: { ...DEFAULT_MODELS[provider], ...parsed.llm?.models },
    },
    email: {
      allowedSenders: (parsed.email?.allowed_senders ?? []).map((s) => s.trim().toLowerCase()),
    },
  };
  return cachedConfig;
}

let cachedSecrets: Secrets | null = null;

export function loadSecrets(): Secrets {
  if (cachedSecrets) return cachedSecrets;

  const secretsPath = process.env.SECRETS_FILE || './secrets.yml';
  if (!existsSync(secretsPath)) {
    console.warn(`Secrets file not found at ${secretsPath}`);
    cachedSecrets = {};
  } else {
    cachedSecrets = (parse(readFileSync(secretsPath, 'utf-8')) as Secrets | null) ?? {};
  }
  return cachedSecrets;
}

/** Replace the loaded config/secrets, for tests. Pass null to reload from disk. */
export function setConfigForTests(config: Config | null, secrets: Secrets | null = null): void {
  cachedConfig = config;
  cachedSecrets = secrets;
}
