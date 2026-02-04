"use client";

import { ThreadMessageLike, AppendMessage, AssistantRuntimeProvider, useExternalStoreRuntime } from "@assistant-ui/react";
import { useState, useCallback, useRef, createContext, useContext } from "react";
import { trpc } from "@/lib/trpc";

// Context for streaming logs to the operations panel
interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'tool_use' | 'tool_result' | 'message' | 'error' | 'thinking';
  tool?: string;
  input?: any;
  output?: any;
  message?: string;
  error?: string;
}

interface LogContextType {
  logs: LogEntry[];
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  clearThinkingLogs: () => void;
}

const LogContext = createContext<LogContextType>({
  logs: [],
  addLog: () => {},
  clearLogs: () => {},
  clearThinkingLogs: () => {},
});

export const useOperationLogs = () => useContext(LogContext);

// Generate unique message IDs
let messageIdCounter = 0;
const generateMessageId = () => `msg-${Date.now()}-${++messageIdCounter}`;

const convertMessage = (message: ThreadMessageLike) => {
  return message;
};

export function PDFAssistantRuntimeProvider({
  children,
  provider = "manus",
  apiKey,
}: {
  children: React.ReactNode;
  provider?: "claude" | "manus";
  apiKey?: string;
}) {
  // Track running state for loading indicator
  const [isRunning, setIsRunning] = useState(false);
  
  // Store conversation history with unique IDs
  const [messages, setMessages] = useState<readonly ThreadMessageLike[]>([
    {
      id: generateMessageId(),
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Hello! I'm your PDF Editor Agent. I can help you with PDF operations like combining, splitting, adding watermarks, and more. What would you like to do?",
        },
      ],
    },
  ]);

  // Local logs state for real-time streaming
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const addLog = useCallback((log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newLog: LogEntry = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setLogs(prev => [...prev, newLog]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Clear only thinking logs (when response completes)
  const clearThinkingLogs = useCallback(() => {
    setLogs(prev => prev.filter(log => log.type !== 'thinking'));
  }, []);

  // Track conversation history for the agent
  const conversationHistoryRef = useRef<Array<{ role: string; content: string }>>([]);

  const chatMutation = trpc.pdfAgent.chat.useMutation();

  const onNew = useCallback(async (message: AppendMessage) => {
    if (message.content.length !== 1 || message.content[0]?.type !== "text")
      throw new Error("Only text content is supported");

    const userText = message.content[0].text;
    const userMessageId = generateMessageId();

    // Add user message to UI
    const userMessage: ThreadMessageLike = {
      id: userMessageId,
      role: "user",
      content: [{ type: "text", text: userText }],
    };
    setMessages((currentMessages) => [...currentMessages, userMessage]);

    // Add to conversation history
    conversationHistoryRef.current.push({ role: "user", content: userText });

    // Set running state to show loading indicator
    setIsRunning(true);

    // Add a "thinking" log entry
    addLog({
      type: 'thinking',
      message: 'Processing your request...',
    });

    // Create placeholder assistant message for streaming effect
    const assistantMessageId = generateMessageId();
    const placeholderMessage: ThreadMessageLike = {
      id: assistantMessageId,
      role: "assistant",
      content: [{ type: "text", text: "" }],
    };
    setMessages((currentMessages) => [...currentMessages, placeholderMessage]);

    try {
      // Build conversation context for the agent
      const conversationContext = conversationHistoryRef.current
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');

      const result = await chatMutation.mutateAsync({
        message: userText,
        conversationHistory: conversationHistoryRef.current,
        llmProvider: provider,
        anthropicApiKey: apiKey,
      });

      // Add assistant response to conversation history
      conversationHistoryRef.current.push({ role: "assistant", content: result.response });

      // Update the placeholder message with actual content
      setMessages((currentMessages) =>
        currentMessages.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: [{ type: "text", text: result.response }],
              }
            : m
        )
      );

      // Clear thinking logs and add completion log
      clearThinkingLogs();
      addLog({
        type: 'message',
        message: 'Response generated successfully',
      });

    } catch (error) {
      const errorText = `Error: ${error instanceof Error ? error.message : "Failed to process request"}`;
      
      // Update placeholder with error message
      setMessages((currentMessages) =>
        currentMessages.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: [{ type: "text", text: errorText }],
              }
            : m
        )
      );

      // Clear thinking logs and add error log
      clearThinkingLogs();
      addLog({
        type: 'error',
        error: error instanceof Error ? error.message : "Failed to process request",
      });
    } finally {
      setIsRunning(false);
    }
  }, [chatMutation, provider, apiKey, addLog, clearThinkingLogs]);

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    isRunning,
    messages,
    setMessages,
    onNew,
    convertMessage,
  });

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs, clearThinkingLogs }}>
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </LogContext.Provider>
  );
}
