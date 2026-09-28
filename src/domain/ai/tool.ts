import type Anthropic from '@anthropic-ai/sdk';
import { Student } from '../students/student.entity';

/** Everything a tool may need; `student` is the caller — tools never take a student id from the model. */
export interface ToolContext {
  student: Student;
  now: Date;
  timeZone: string;
}

export interface ToolResult {
  /** Returned to the model as the tool result. Keep it short. */
  data: Record<string, unknown>;
  /** Optional Telegram inline keyboard the reply should carry (e.g. import confirmation). */
  keyboard?: Array<Array<{ text: string; callbackData: string }>>;
}

/**
 * A tool the agent can call. `input_schema` is JSON Schema; with `strict` the
 * API guarantees the input matches it, but `handle` still validates anything
 * that matters (ids, ranges) before touching the database.
 */
export interface AgentTool<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  handle(input: TInput, ctx: ToolContext): Promise<ToolResult>;
}

/** Multi-provider token: every tool module contributes its tools under this token. */
export const AGENT_TOOLS = Symbol('AGENT_TOOLS');

export function toApiTool(tool: AgentTool): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
    strict: true,
  };
}
