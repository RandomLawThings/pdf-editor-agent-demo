# PDF Editor Agent - TODO

## Claude Agent SDK Integration
- [x] Install Claude Agent SDK (@anthropic-ai/sdk with agent support)
- [x] Create agent tools for each PDF operation (split, combine, watermark, etc.)
- [x] Implement tool execution with automatic logging
- [x] Wire agent to chat interface
- [x] Test agent tool calling and responses

## UI Improvements
- [x] Create tabbed Operations Panel (Logs tab + PDF Viewer tab)
- [x] Add PDF viewer component placeholder to Operations Panel
- [x] Split Documents panel vertically (Original docs top, Revised docs bottom)
- [x] Update document upload to categorize as original
- [x] Add operation results as revised documents
- [x] Improve visual separation between original and revised sections

## Testing
- [x] Test agent tool execution end-to-end
- [x] Verify operations log updates automatically
- [x] Test PDF viewer placeholder in operations panel
- [x] Verify document categorization works correctly
- [x] All vitest tests passing (7 passed, 1 skipped)

## Future Enhancements
- [ ] Implement full PDF viewer with page navigation
- [ ] Add batch operations support
- [ ] Connect Python MCP server for advanced features
- [ ] Add document preview thumbnails
- [ ] Implement operation history persistence in database

## Bug Fix: Claude API 404 Error
- [x] Investigate why Claude API returns 404
- [x] Check API key configuration
- [x] Verify API endpoint is correct
- [x] Test API connection
- [x] Fix and verify chat works with real API calls

## Bug Fix: Wrong Model Being Used
- [x] Investigate why agent responds as Google model instead of Claude
- [x] Check model parameter in invokeLLM call
- [x] Verify Manus Forge API is routing to correct model
- [x] Make Claude vs Manus models configurable (optional Anthropic API key)
- [ ] Test with both Claude and Manus models (needs testing)

## Implement assistant-ui Chat Interface
- [x] Install @assistant-ui/react and related packages
- [x] Create runtime adapter for tRPC backend
- [x] Replace ChatPanel with assistant-ui Thread component
- [x] Add model toggle switch (Claude/Manus)
- [x] Integrate with PDF agent backend
- [x] Test streaming and tool calling

## Bug Fix: Undefined URL Error
- [x] Investigate where undefined 'url' error occurs
- [x] Add proper null/undefined checks
- [x] Test document upload and operations

## Bug Fix: Backend Undefined URL Error
- [x] Investigate backend code for undefined URL access
- [x] Fix Claude API message format for tool_use/tool_result blocks
- [x] Fix pdf-parse import issue
- [x] Test PDF operations end-to-end

## UX Improvements: Loading States and Streaming
- [x] Research assistant-ui library for loading indicators
- [x] Add loading/thinking indicator while agent is processing
- [x] Stream tool calls to logs in real-time (not after completion)
- [x] Fix chat input border (blue selection) overlapping text
- [x] Ensure full conversation history is passed to agent
- [x] Test all improvements end-to-end

## Bug Fix: Chat Input Disappears on Long Conversations
- [x] Fix chat panel layout to keep input pinned at bottom
- [x] Ensure messages scroll while composer stays fixed
- [x] Test with long conversations

## Stamp Functionality Integration
- [x] Clone and analyze Manus hackathon GitHub repo
- [x] Understand existing stamp implementation
- [x] Implement prepare_stamp tool with size estimation
- [x] Integrate stamp placement with find_whitespace
- [x] Add add_stamp tool to agent
- [x] Test stamp workflow end-to-end

## Operations Log UX Improvements
- [x] Make log entries one-line with clickable expand
- [x] Add scrollbar to Operations log panel
- [x] Add clear_revised_documents tool for agent
- [x] Test all improvements

## Log Display Improvements
- [x] Combine tool_use and tool_result into single log entries
- [x] Remove duplicate Running/Done pairs
- [x] Clear Processing state when response is complete
- [x] Test log display improvements

## Bug Fix: Duplicate React Keys in Operations Log
- [x] Fix duplicate key generation for log entries
- [x] Use unique identifiers instead of Date.now()

## UI Cleanup: Reduce Whitespace and Simplify Headers
- [x] Remove Operations header, keep only Logs/Viewer tabs
- [x] Remove Documents header, show Original/Revised sections directly
- [x] Reduce whitespace in all panel headers
- [x] Use clean Lucide icons throughout

## Bug Fix: Log Input Capture and Whitespace
- [x] Fix INPUT not being captured in logs (now matches tool_use with tool_result)
- [x] Reduce whitespace above panel headings

## Bug Fix: Whitespace Above Header
- [x] Remove whitespace above the main header (added m-0 p-0 to html,body)

## UI Changes: API Key and Reset
- [x] Remove provider toggle from settings
- [x] Add Anthropic API key field at top of page
- [x] Disable chat input without API key
- [x] Add New/Reset button to clear files, chats, and logs

## PDF Viewer Feature
- [x] Install react-pdf and configure dependencies
- [x] Create PDFViewer component
- [x] Integrate PDFViewer into Viewer tab
- [x] Add document selection for viewing

## PDF Viewer Improvements
- [x] Auto-resize PDF to fit viewer size
- [x] Increase control bar height
- [x] Click PDF in documents list activates Viewer tab

## Header Alignment and Spacing
- [x] Align all panel headers to same height (h-10)
- [x] Balance whitespace (padding) around headings/buttons/tabs
- [x] Add Lucide icon (FolderOpen) beside Documents heading
