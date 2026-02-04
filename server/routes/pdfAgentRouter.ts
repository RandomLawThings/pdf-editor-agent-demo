/**
 * PDF Agent Router - Uses Claude with tool calling
 *
 * Documents and logs are scoped by session ID to prevent cross-user contamination.
 */

import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '../_core/trpc';
import { runPdfAgent, AgentLog } from '../services/claudeAgent';
import { storagePut } from '../storage';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { ENV } from '../_core/env';
import { generateSessionId, buildSessionScopedKey } from '../_core/session';

// In-memory storage for documents and logs, scoped by session ID
// Key format: `${sessionId}:${docId}` for documents
const documents: Map<string, any> = new Map();
const operationLogs: Map<string, AgentLog[]> = new Map();

// Helper to build session-scoped document key
function docKey(sessionId: string, docId: string): string {
  return `${sessionId}:${docId}`;
}

// Helper to get all documents for a session
function getSessionDocuments(sessionId: string): any[] {
  return Array.from(documents.entries())
    .filter(([key]) => key.startsWith(`${sessionId}:`))
    .map(([, doc]) => doc);
}

export const pdfAgentRouter = router({
  /**
   * Validate an Anthropic API key by making a simple API call
   */
  validateApiKey: publicProcedure
    .input(z.object({
      apiKey: z.string().min(1)
    }))
    .mutation(async ({ input }) => {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;

      try {
        const client = new Anthropic({
          apiKey: input.apiKey
        });

        // Make a minimal API call to validate the key
        // Using a tiny max_tokens to minimize cost
        await client.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }]
        });

        return {
          valid: true,
          message: 'API key is valid'
        };
      } catch (error: any) {
        // Check for specific error types
        if (error?.status === 401 || error?.message?.includes('invalid x-api-key')) {
          return {
            valid: false,
            message: 'Invalid API key'
          };
        }
        if (error?.status === 403) {
          return {
            valid: false,
            message: 'API key lacks required permissions'
          };
        }
        if (error?.status === 429) {
          // Rate limited but key is valid
          return {
            valid: true,
            message: 'API key is valid (rate limited)'
          };
        }

        // For other errors, assume key might be valid but there's a network issue
        return {
          valid: false,
          message: error?.message || 'Failed to validate API key'
        };
      }
    }),

  /**
   * Initialize or validate a session (generates session ID if needed)
   */
  initSession: publicProcedure
    .input(z.object({
      sessionId: z.string().optional()
    }).optional())
    .mutation(async ({ input }) => {
      // Generate a new session ID if none provided or invalid
      const sessionId = input?.sessionId && /^[a-f0-9]{32}$/.test(input.sessionId)
        ? input.sessionId
        : generateSessionId();

      return {
        sessionId,
        message: 'Session initialized'
      };
    }),

  /**
   * Upload a PDF document
   */
  upload: protectedProcedure
    .input(z.object({
      filename: z.string(),
      fileData: z.string(), // Base64 encoded
      type: z.enum(['original', 'revised']).default('original')
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.sessionId) {
        throw new Error('Session ID required. Call initSession first.');
      }

      const buffer = Buffer.from(input.fileData, 'base64');
      const docId = randomBytes(8).toString('hex');
      // Use session-scoped storage path
      const fileKey = buildSessionScopedKey(ctx.sessionId, `${docId}-${input.filename}`);

      const { url } = await storagePut(fileKey, buffer, 'application/pdf');

      const document = {
        id: docId,
        name: input.filename,
        url,
        type: input.type,
        uploadedAt: new Date(),
        sessionId: ctx.sessionId
      };

      documents.set(docKey(ctx.sessionId, docId), document);

      return {
        success: true,
        document
      };
    }),

  /**
   * List all documents for the current session
   * Uses publicProcedure to avoid 500 errors when session header doesn't arrive
   * Returns empty arrays when no session exists (graceful degradation)
   */
  listDocuments: publicProcedure
    .query(async ({ ctx }) => {
      if (!ctx.sessionId) {
        return { original: [], revised: [] };
      }

      const sessionDocs = getSessionDocuments(ctx.sessionId);

      return {
        original: sessionDocs.filter(d => d.type === 'original'),
        revised: sessionDocs.filter(d => d.type === 'revised')
      };
    }),

  /**
   * Chat with the PDF agent
   */
  chat: protectedProcedure
    .input(z.object({
      message: z.string(),
      conversationHistory: z.array(z.object({
        role: z.string(),
        content: z.string()
      })).optional(),
      llmProvider: z.enum(['claude', 'manus']).optional(),
      anthropicApiKey: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.sessionId) {
        throw new Error('Session ID required. Call initSession first.');
      }

      const sessionDocs = getSessionDocuments(ctx.sessionId);
      const logSessionId = `${ctx.sessionId}-${Date.now()}`;
      const logs: AgentLog[] = [];

      // Callback to clear revised documents when the agent calls clear_revised_documents tool
      const clearRevisedCallback = async () => {
        const revisedKeys = Array.from(documents.entries())
          .filter(([key, d]) => key.startsWith(`${ctx.sessionId}:`) && d.type === 'revised')
          .map(([key]) => key);

        let deletedCount = 0;
        for (const key of revisedKeys) {
          documents.delete(key);
          deletedCount++;
        }

        return { deletedCount };
      };

      // Callback to delete specific documents by ID
      const deleteDocumentsCallback = async (ids: string[]) => {
        let deletedCount = 0;
        let skippedOriginals = 0;

        for (const docId of ids) {
          const key = docKey(ctx.sessionId!, docId);
          const doc = documents.get(key);
          if (doc) {
            if (doc.type === 'revised') {
              documents.delete(key);
              deletedCount++;
            } else {
              skippedOriginals++;
            }
          }
        }

        return { deletedCount, skippedOriginals };
      };

      // Determine LLM config - prioritize explicit input, then env, then manus
      let llmConfig;
      if (input.llmProvider) {
        llmConfig = {
          provider: input.llmProvider,
          anthropicApiKey: input.anthropicApiKey,
          model: input.llmProvider === 'claude' ? 'claude-opus-4-20250514' : 'gemini-2.5-flash'
        };
      } else if (ENV.standaloneMode && ENV.anthropicApiKey) {
        // In standalone mode, default to Claude with env API key
        llmConfig = {
          provider: 'claude' as const,
          anthropicApiKey: ENV.anthropicApiKey,
          model: 'claude-opus-4-20250514'
        };
      }
      // If neither, llmConfig stays undefined and will use Manus default

      const result = await runPdfAgent(input.message, {
        documents: sessionDocs,
        userId: ctx.sessionId, // Use session ID as user identifier
        conversationHistory: input.conversationHistory,
        llmConfig,
        onLog: (log) => {
          logs.push(log);
        },
        clearRevisedCallback,
        deleteDocumentsCallback
      });

      // Store logs (scoped by session)
      operationLogs.set(logSessionId, logs);

      // Add any new revised documents from operations
      // Use IDs from tool results (generated by the tools themselves) so agent can reference them
      for (const op of result.operations) {
        if (op.result.url && op.result.id) {
          const document = {
            id: op.result.id,
            name: op.result.filename || `${op.tool}_result.pdf`,
            url: op.result.url,
            type: 'revised' as const,
            uploadedAt: new Date(),
            sessionId: ctx.sessionId,
            operation: op.tool
          };
          documents.set(docKey(ctx.sessionId, op.result.id), document);
        }

        // Handle multiple files (like split_pdf)
        if (op.result.files && Array.isArray(op.result.files)) {
          for (const file of op.result.files) {
            const fileDocId = file.id || randomBytes(8).toString('hex');
            const document = {
              id: fileDocId,
              name: file.filename || `${op.tool}_result.pdf`,
              url: file.url,
              type: 'revised' as const,
              uploadedAt: new Date(),
              sessionId: ctx.sessionId,
              operation: op.tool,
              pages: file.pages
            };
            documents.set(docKey(ctx.sessionId, fileDocId), document);
          }
        }
      }

      return {
        response: result.response,
        sessionId: logSessionId,
        operations: result.operations.map(op => ({
          tool: op.tool,
          success: op.result.success !== false
        }))
      };
    }),

  /**
   * Get operation logs for a session
   * Uses publicProcedure to avoid 500 errors when session header doesn't arrive
   * Returns empty array when no session exists (graceful degradation)
   */
  getLogs: publicProcedure
    .input(z.object({
      logSessionId: z.string().optional()
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.sessionId) {
        return [];
      }

      if (input.logSessionId) {
        // Only return logs if they belong to this session
        if (input.logSessionId.startsWith(ctx.sessionId)) {
          return operationLogs.get(input.logSessionId) || [];
        }
        return [];
      }

      // Return all logs for this session
      const sessionLogs: AgentLog[] = Array.from(operationLogs.entries())
        .filter(([key]) => key.startsWith(ctx.sessionId!))
        .flatMap(([, logs]) => logs);

      // Sort by timestamp descending
      return sessionLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }),

  /**
   * Delete a document
   */
  deleteDocument: protectedProcedure
    .input(z.object({
      documentId: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.sessionId) {
        throw new Error('Session ID required');
      }

      const key = docKey(ctx.sessionId, input.documentId);
      const doc = documents.get(key);

      if (!doc) {
        throw new Error('Document not found');
      }

      documents.delete(key);

      return {
        success: true
      };
    }),

  /**
   * Clear all revised documents for the current session
   * This is called by the agent when starting fresh work on documents
   */
  clearRevisedDocuments: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.sessionId) {
        return { success: false, deletedCount: 0, message: 'No session' };
      }

      const revisedKeys = Array.from(documents.entries())
        .filter(([key, d]) => key.startsWith(`${ctx.sessionId}:`) && d.type === 'revised')
        .map(([key]) => key);

      let deletedCount = 0;
      for (const key of revisedKeys) {
        documents.delete(key);
        deletedCount++;
      }

      return {
        success: true,
        deletedCount,
        message: `Cleared ${deletedCount} revised document(s)`
      };
    }),

  /**
   * Clear all documents and logs for the current session (full reset)
   */
  clearAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.sessionId) {
        return { success: false, deletedDocuments: 0, message: 'No session' };
      }

      // Clear all documents for this session
      const sessionKeys = Array.from(documents.keys())
        .filter(key => key.startsWith(`${ctx.sessionId}:`));

      let deletedDocs = 0;
      for (const key of sessionKeys) {
        documents.delete(key);
        deletedDocs++;
      }

      // Clear logs for this session only
      const logKeys = Array.from(operationLogs.keys())
        .filter(key => key.startsWith(ctx.sessionId!));
      for (const key of logKeys) {
        operationLogs.delete(key);
      }

      return {
        success: true,
        deletedDocuments: deletedDocs,
        message: `Session cleared: ${deletedDocs} document(s) removed`
      };
    })
});
