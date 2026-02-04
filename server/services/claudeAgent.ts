/**
 * PDF Agent with Tool Calling
 * Supports both Claude (Anthropic) and Manus models (Gemini/GPT)
 */

import { callLLM, type LLMConfig, type LLMMessage, type LLMTool, type LLMToolCall } from './llmService';
import { pdfMcpTools } from './pdfMcpTools';

export interface AgentContext {
  documents: any[];
  userId: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  onLog?: (log: AgentLog) => void;
  llmConfig?: LLMConfig;
  clearRevisedCallback?: () => Promise<{ deletedCount: number }>;
  deleteDocumentsCallback?: (ids: string[]) => Promise<{ deletedCount: number; skippedOriginals: number }>;
}

export interface AgentLog {
  timestamp: Date;
  type: 'tool_use' | 'tool_result' | 'message' | 'error';
  tool?: string;
  input?: any;
  output?: any;
  message?: string;
  error?: string;
}

// Define PDF tools
const PDF_TOOLS: LLMTool[] = [
  {
    name: 'split_pdf',
    description: 'Split a PDF into multiple files by page ranges. Use this when the user wants to separate pages or create multiple documents from one PDF.',
    input_schema: {
      type: 'object',
      properties: {
        documentId: { 
          type: 'string', 
          description: 'ID of the document to split (use the ID from available documents)' 
        },
        pageRanges: {
          type: 'array',
          description: 'Array of page ranges to extract',
          items: {
            type: 'object',
            properties: {
              start: { type: 'number', description: '1-indexed start page number' },
              end: { type: 'number', description: '1-indexed end page number (inclusive)' },
              outputName: { type: 'string', description: 'Name for the output file' }
            },
            required: ['start', 'end']
          }
        }
      },
      required: ['documentId', 'pageRanges']
    }
  },
  {
    name: 'combine_pdfs',
    description: 'Combine multiple PDF files into a single document. Use this when the user wants to merge or concatenate PDFs.',
    input_schema: {
      type: 'object',
      properties: {
        documentIds: {
          type: 'array',
          description: 'Array of document IDs to combine in order',
          items: { type: 'string' }
        },
        outputName: {
          type: 'string',
          description: 'Name for the combined PDF file'
        }
      },
      required: ['documentIds']
    }
  },
  {
    name: 'add_watermark',
    description: 'Add a text watermark to all pages of a PDF. Use this for branding, confidentiality marks, or draft labels.',
    input_schema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document to watermark' },
        text: { type: 'string', description: 'Watermark text to add' },
        opacity: { type: 'number', description: 'Opacity from 0.0 to 1.0 (default 0.3)' },
        fontSize: { type: 'number', description: 'Font size in points (default 48)' },
        rotation: { type: 'number', description: 'Rotation angle in degrees (default 45)' }
      },
      required: ['documentId', 'text']
    }
  },
  {
    name: 'add_page_numbers',
    description: 'Add page numbers to a PDF document. Use this to number pages for reference or organization.',
    input_schema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document to add page numbers to' },
        position: { 
          type: 'string', 
          enum: ['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'],
          description: 'Position of page numbers on the page'
        },
        startNumber: { type: 'number', description: 'Starting page number (default 1)' },
        format: { type: 'string', description: 'Format string like "Page {n}" (default "{n}")' }
      },
      required: ['documentId']
    }
  },
  {
    name: 'extract_text',
    description: 'Extract all text content from a PDF document. Use this to read or analyze PDF text.',
    input_schema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document to extract text from' }
      },
      required: ['documentId']
    }
  },
  {
    name: 'check_margins',
    description: 'Analyze PDF margins to detect content that might be cut off during printing. Returns warnings about margin issues.',
    input_schema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document to check' },
        marginSize: { type: 'number', description: 'Minimum safe margin size in points (default 36 = 0.5 inch)' }
      },
      required: ['documentId']
    }
  },
  {
    name: 'find_whitespace',
    description: 'Find clear rectangular areas in a PDF suitable for stamps, signatures, or annotations. Uses image analysis to detect actual whitespace. Returns coordinates of whitespace regions ranked by preference.',
    input_schema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document to analyze' },
        pageNumber: { type: 'number', description: '1-indexed page number to analyze (default 1)' },
        minWidthInches: { type: 'number', description: 'Minimum width in inches (default 1.5)' },
        minHeightInches: { type: 'number', description: 'Minimum height in inches (default 0.5)' },
        prefer: { 
          type: 'string', 
          enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom', 'top', 'any'],
          description: 'Preferred location for the whitespace (default bottom-right)'
        }
      },
      required: ['documentId']
    }
  },
  {
    name: 'prepare_stamp',
    description: 'Estimate the size needed for a stamp with given text. Use this BEFORE find_whitespace to know what dimensions to search for. Returns recommended minWidthInches and minHeightInches for find_whitespace.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The stamp text (e.g., "EXHIBIT A", "FILED", "NOLAN")' },
        fontSize: { type: 'number', description: 'Font size in points (default 14)' },
        borderWidth: { type: 'number', description: 'Border width in points (default 2)' },
        padding: { type: 'number', description: 'Padding inside border in points (default 10)' },
        includeDate: { type: 'boolean', description: 'Whether to include current date below text (default true)' }
      },
      required: ['text']
    }
  },
  {
    name: 'add_stamp',
    description: 'Add a positioned stamp/label to a PDF page. Can auto-position by finding whitespace or use explicit coordinates. The stamp includes a border and optional background.',
    input_schema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'ID of the document to stamp' },
        text: { type: 'string', description: 'Stamp text (e.g., "EXHIBIT A", "FILED")' },
        pageNumber: { type: 'number', description: '1-indexed page number to stamp (default 1)' },
        xInches: { type: 'number', description: 'X position in inches from left edge (optional, auto-positions if not provided)' },
        yInches: { type: 'number', description: 'Y position in inches from bottom edge (optional, auto-positions if not provided)' },
        fontSize: { type: 'number', description: 'Font size in points (default 14)' },
        includeDate: { type: 'boolean', description: 'Include current date below text (default true)' },
        autoPosition: { type: 'boolean', description: 'Auto-find whitespace for positioning (default true if no x/y provided)' },
        preferPosition: {
          type: 'string',
          enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
          description: 'Preferred corner for auto-positioning (default top-right)'
        },
        opacity: { type: 'number', description: 'Stamp opacity from 0.0 to 1.0 (default 1.0)' }
      },
      required: ['documentId', 'text']
    }
  },
  {
    name: 'clear_revised_documents',
    description: 'Clear all revised/output documents from the workspace. Use this when starting fresh work on documents or when the user wants to clean up previous results. This removes all documents created by previous operations but keeps the original uploaded documents.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'delete_documents',
    description: 'Delete specific revised documents by their IDs. Use this to clean up intermediate results while keeping the final output documents. Cannot delete original uploaded documents.',
    input_schema: {
      type: 'object',
      properties: {
        documentIds: {
          type: 'array',
          description: 'Array of document IDs to delete',
          items: { type: 'string' }
        }
      },
      required: ['documentIds']
    }
  }
];

export async function runPdfAgent(
  userMessage: string,
  context: AgentContext
): Promise<{ response: string; operations: any[] }> {
  const operations: any[] = [];
  const logs: AgentLog[] = [];

  // Default to Manus models if no config provided
  const llmConfig: LLMConfig = context.llmConfig || {
    provider: 'manus',
    model: 'gemini-2.5-flash'
  };

  const log = (logEntry: Omit<AgentLog, 'timestamp'>) => {
    const fullLog = { ...logEntry, timestamp: new Date() };
    logs.push(fullLog);
    if (context.onLog) {
      context.onLog(fullLog);
    }
  };

  // Build system message with available documents
  const systemMessage = `You are a PDF operations assistant. You can help users manipulate PDF documents using the available tools.

Available documents:
${context.documents.map(doc => `- ${doc.id}: ${doc.name} (${doc.type === 'revised' ? 'REVISED' : 'original'}, ${doc.pages || 'unknown'} pages)`).join('\n')}

When the user asks to perform an operation:
1. Identify which tool to use
2. Extract the necessary parameters from the user's request
3. Call the appropriate tool
4. Explain what you did

IMPORTANT - Cleanup: Before finishing a task, use the delete_documents tool to remove any intermediate revised documents that are no longer needed. Keep only the final output documents the user requested. For example, if you split a PDF and then combined parts of it, delete the split files after combining since only the combined result is needed.

If no documents are uploaded, politely ask the user to upload a PDF first.`;

  // Build messages array with conversation history
  const messages: LLMMessage[] = [
    { role: 'system', content: systemMessage }
  ];

  // Add conversation history if provided (excluding the current message)
  if (context.conversationHistory && context.conversationHistory.length > 0) {
    // Add previous messages from history (skip the last one which is the current message)
    const historyToInclude = context.conversationHistory.slice(0, -1);
    for (const histMsg of historyToInclude) {
      messages.push({
        role: histMsg.role === 'user' ? 'user' : 'assistant',
        content: histMsg.content
      });
    }
  }

  // Add the current user message
  messages.push({ role: 'user', content: userMessage });

  let continueLoop = true;
  let finalResponse = '';
  const maxIterations = 20;
  let iteration = 0;

  while (continueLoop && iteration < maxIterations) {
    iteration++;

    try {
      const result = await callLLM(messages, PDF_TOOLS, llmConfig);

      // Check if there are tool calls
      if (result.toolCalls && result.toolCalls.length > 0) {
        // IMPORTANT: Add assistant message WITH tool_calls for proper Claude API format
        // This is required so that tool_result messages can reference the tool_use blocks
        messages.push({
          role: 'assistant',
          content: result.content || '',
          tool_calls: result.toolCalls
        });

        // Process each tool call
        for (const toolCall of result.toolCalls) {
          const toolName = toolCall.name;
          const toolInput = toolCall.input;

          log({
            type: 'tool_use',
            tool: toolName,
            input: toolInput
          });

          // Track operation for result
          const operation: any = {
            tool: toolName,
            input: toolInput,
            timestamp: new Date(),
            result: {}
          };

          try {
            // Execute the tool
            const toolFunction = (pdfMcpTools as any)[toolName];
            if (!toolFunction) {
              throw new Error(`Tool ${toolName} not found`);
            }

            // Pass context with callbacks if available
            const toolContext = {
              documents: context.documents,
              userId: context.userId,
              clearRevisedCallback: context.clearRevisedCallback,
              deleteDocumentsCallback: context.deleteDocumentsCallback
            };
            const toolResult = await toolFunction(toolInput, toolContext);
            operation.result = toolResult;

            // Add newly created documents to context so subsequent tools can use them
            if (toolResult.id && toolResult.url) {
              context.documents.push({
                id: toolResult.id,
                name: toolResult.filename || `${toolName}_result.pdf`,
                url: toolResult.url,
                type: 'revised',
                pages: 'unknown'
              });
            }
            // Handle multiple files (like split_pdf)
            if (toolResult.files && Array.isArray(toolResult.files)) {
              for (const file of toolResult.files) {
                if (file.id && file.url) {
                  context.documents.push({
                    id: file.id,
                    name: file.filename || `${toolName}_result.pdf`,
                    url: file.url,
                    type: 'revised',
                    pages: file.pages || 'unknown'
                  });
                }
              }
            }

            log({
              type: 'tool_result',
              tool: toolName,
              output: toolResult
            });

            // Add tool result to messages
            messages.push({
              role: 'tool',
              content: JSON.stringify(toolResult),
              tool_call_id: toolCall.id,
              name: toolName
            });

          } catch (error: any) {
            const errorMessage = error.message || 'Tool execution failed';
            operation.result = { success: false, error: errorMessage };
            
            log({
              type: 'error',
              tool: toolName,
              error: errorMessage
            });

            messages.push({
              role: 'tool',
              content: JSON.stringify({ error: errorMessage }),
              tool_call_id: toolCall.id,
              name: toolName
            });
          }

          operations.push(operation);
        }
      } else {
        // No more tool calls, we have the final response
        // Add assistant message without tool_calls
        messages.push({
          role: 'assistant',
          content: result.content || ''
        });

        finalResponse = result.content;
        
        log({
          type: 'message',
          message: finalResponse
        });

        continueLoop = false;
      }

    } catch (error: any) {
      log({
        type: 'error',
        error: error.message || 'Agent execution failed'
      });

      finalResponse = `I encountered an error: ${error.message}. Please try again.`;
      continueLoop = false;
    }
  }

  if (iteration >= maxIterations) {
    finalResponse = 'I reached the maximum number of operations. Please start a new conversation.';
  }

  return {
    response: finalResponse || 'Operation completed.',
    operations
  };
}
