import OpenAI from 'openai';
import type {
  ResponseInput,
  ResponseInputFile,
  ResponseInputText,
} from 'openai/resources/responses/responses';
import type { TaskModels } from '../../config.js';
import { BaseLLM, ReasoningLevel, type LLMRequest } from './interface.js';

export class OpenAILLM extends BaseLLM {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private models: TaskModels,
  ) {
    super();
    this.client = new OpenAI({ apiKey });
  }

  /** Files (PDF tickets and the like) ride along with the final user message. */
  private buildInput(request: LLMRequest): ResponseInput {
    const input: ResponseInput = request.messages.map((msg) => ({ role: msg.role, content: msg.content }));

    if (request.files?.length) {
      const fileParts: ResponseInputFile[] = request.files.map((file) => ({
        type: 'input_file',
        filename: file.filename,
        file_data: `data:${file.mimeType};base64,${file.base64}`,
      }));
      const last = input[input.length - 1];
      if (last && 'role' in last && last.role === 'user' && typeof last.content === 'string') {
        const text: ResponseInputText = { type: 'input_text', text: last.content };
        last.content = [text, ...fileParts];
      } else {
        input.push({ role: 'user', content: fileParts });
      }
    }

    return input;
  }

  private getReasoning(request: LLMRequest) {
    const reasoning = request.options?.reasoning;
    if (!reasoning) return undefined;

    // GPT-5.6 models accept none/low/medium/high/xhigh/max - there is no
    // "minimal" level, so the lowest interface level maps to "none".
    switch (reasoning) {
      case ReasoningLevel.MINIMAL:
        return { effort: 'none' as const };
      case ReasoningLevel.LOW:
        return { effort: 'low' as const };
      case ReasoningLevel.MEDIUM:
        return { effort: 'medium' as const };
      case ReasoningLevel.HIGH:
        return { effort: 'high' as const };
    }
  }

  protected async completeJson(
    request: LLMRequest,
    schema: { name: string; jsonSchema: Record<string, unknown> },
  ): Promise<string> {
    const response = await this.client.responses.create({
      model: this.models[request.task],
      instructions: request.systemPrompt,
      input: this.buildInput(request),
      reasoning: this.getReasoning(request),
      text: {
        format: {
          type: 'json_schema',
          name: schema.name,
          schema: schema.jsonSchema,
          strict: true,
        },
      },
    });
    return response.output_text ?? '';
  }
}
