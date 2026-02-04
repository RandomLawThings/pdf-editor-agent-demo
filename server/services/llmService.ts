/**
 * Flexible LLM Service
 * Supports both Claude (via Anthropic API) and Manus models (Gemini/GPT)
 */

import Anthropic from '@anthropic-ai/sdk';
import { invokeLLM, type Tool as OpenAITool, type Message as OpenAIMessage } from '../_core/llm';

export interface LLMConfig {
  provider: 'claude' | 'manus';
  anthropicApiKey?: string;
  model?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  // For Claude: store tool_use blocks when assistant calls tools
  tool_calls?: LLMToolCall[];
}

export interface LLMTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: any;
}

export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  stopReason: string;
}

// Convert tool format between Anthropic and OpenAI
function convertToolToOpenAI(tool: LLMTool): OpenAITool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  };
}

function convertToolToAnthropic(tool: LLMTool): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema
  };
}

export async function callLLM(
  messages: LLMMessage[],
  tools: LLMTool[],
  config: LLMConfig
): Promise<LLMResponse> {
  if (config.provider === 'claude' && config.anthropicApiKey) {
    return await callClaude(messages, tools, config);
  } else {
    return await callManus(messages, tools, config);
  }
}

async function callClaude(
  messages: LLMMessage[],
  tools: LLMTool[],
  config: LLMConfig
): Promise<LLMResponse> {
  const client = new Anthropic({
    apiKey: config.anthropicApiKey
  });

  // Separate system messages from conversation
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  // Convert messages to Anthropic format
  // Key fix: properly handle assistant messages with tool_calls and tool results
  const anthropicMessages: Anthropic.MessageParam[] = [];
  
  for (let i = 0; i < conversationMessages.length; i++) {
    const msg = conversationMessages[i];
    
    if (msg.role === 'tool') {
      // Tool results need to be grouped with the previous assistant message's tool_use
      // Find all consecutive tool messages and group them
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let j = i;
      while (j < conversationMessages.length && conversationMessages[j].role === 'tool') {
        const toolMsg = conversationMessages[j];
        toolResults.push({
          type: 'tool_result' as const,
          tool_use_id: toolMsg.tool_call_id || 'unknown',
          content: toolMsg.content
        });
        j++;
      }
      
      // Add as a user message containing tool results
      anthropicMessages.push({
        role: 'user' as const,
        content: toolResults
      });
      
      // Skip the tool messages we just processed (minus 1 because loop will increment)
      i = j - 1;
      continue;
    }
    
    if (msg.role === 'assistant') {
      // Check if this assistant message has tool calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Build content blocks with both text and tool_use
        const contentBlocks: (Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam)[] = [];
        
        if (msg.content) {
          contentBlocks.push({
            type: 'text' as const,
            text: msg.content
          });
        }
        
        for (const tc of msg.tool_calls) {
          contentBlocks.push({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.name,
            input: tc.input
          });
        }
        
        anthropicMessages.push({
          role: 'assistant' as const,
          content: contentBlocks
        });
      } else {
        // Regular assistant message without tool calls
        anthropicMessages.push({
          role: 'assistant' as const,
          content: msg.content
        });
      }
      continue;
    }
    
    // User messages
    anthropicMessages.push({
      role: 'user' as const,
      content: msg.content
    });
  }

  const response = await client.messages.create({
    model: config.model || 'claude-opus-4-20250514',
    max_tokens: 4096,
    system: systemMessages.map(m => m.content).join('\n\n'),
    messages: anthropicMessages,
    tools: tools.map(convertToolToAnthropic)
  });

  // Extract content and tool calls
  let textContent = '';
  const toolCalls: LLMToolCall[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      textContent += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input
      });
    }
  }

  return {
    content: textContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    stopReason: response.stop_reason || 'end_turn'
  };
}

async function callManus(
  messages: LLMMessage[],
  tools: LLMTool[],
  config: LLMConfig
): Promise<LLMResponse> {
  // Convert to OpenAI format
  const openaiMessages: OpenAIMessage[] = messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id, name: msg.name } : {})
  }));

  const result = await invokeLLM({
    messages: openaiMessages,
    tools: tools.map(convertToolToOpenAI),
    toolChoice: 'auto',
    maxTokens: 4096
  });

  const choice = result.choices[0];
  if (!choice) {
    throw new Error('No response from LLM');
  }

  const message = choice.message;
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

  // Convert tool calls if present
  const toolCalls: LLMToolCall[] = [];
  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments)
      });
    }
  }

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    stopReason: choice.finish_reason || 'stop'
  };
}
