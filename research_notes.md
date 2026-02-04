# Assistant-UI Research Notes

## Key Findings for Loading States and Streaming

### 1. isRunning State
- The `isRunning` boolean controls the loading indicator
- When `isRunning` is true, the assistant's message appears with an "in_progress" status
- This provides a visual loading indicator automatically
- When `isRunning` becomes false, the message updates to "complete" status

### 2. Streaming Pattern
```javascript
const onNew = async (message: AppendMessage) => {
  // Add user message
  setMessages((prev) => [...prev, userMessage]);
  
  // Create placeholder for assistant message
  setIsRunning(true);
  const assistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: "" }],
    id: assistantId,
  };
  setMessages((prev) => [...prev, assistantMessage]);
  
  // Stream response - update message progressively
  for await (const chunk of stream) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? { ...m, content: [{ type: "text", text: m.content[0].text + chunk }] }
          : m
      )
    );
  }
  setIsRunning(false);
};
```

### 3. Tool Calling Support
- Tool calls should be added as content parts with type: "tool-call"
- Tool results are matched by toolCallId
- Can use onAddToolResult handler for automatic matching

### 4. Message IDs
- Each message should have a unique `id` for proper tracking
- This enables streaming updates to specific messages
- Required for tool call/result matching

## Implementation Plan

1. **Add isRunning state** to AssistantRuntimeProvider
2. **Set isRunning=true** when API call starts
3. **Set isRunning=false** when API call completes
4. **Add message IDs** for proper tracking
5. **Stream tool calls** to logs panel in real-time via callback
6. **Fix conversation history** by maintaining full message array
