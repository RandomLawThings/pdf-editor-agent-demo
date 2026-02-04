# PDF Editor Agent

A modern, AI-powered PDF editing application with natural language interface. Built with React, shadcn/ui, Tailwind CSS, and Claude AI integration using a hybrid Node.js + Python architecture.

## Features

### Core PDF Operations
- **Combine PDFs**: Merge multiple PDF files into a single document
- **Split PDF**: Divide a PDF into multiple files by page ranges
- **Reorder Pages**: Change the order of pages within a PDF
- **Add Watermarks**: Apply text watermarks to PDF pages
- **Add Page Numbers**: Insert page numbers in various positions
- **Extract Text**: Extract text content from PDF pages

### Advanced Whitespace Detection
- **Margin Checking**: Detect content in page margins that might be cut off during printing
- **Page Number Position Check**: Verify if standard page number positions are clear
- **Find Whitespace Regions**: Locate clear rectangular areas suitable for stamps or signatures

### AI-Powered Chat Interface
- Natural language PDF operation requests
- Powered by Claude AI for intelligent command understanding
- Context-aware responses and operation suggestions
- Real-time operations tracking

## Architecture

### Hybrid Implementation

This application uses a **hybrid approach** combining the best of both worlds:

**1. Node.js PDF Libraries (Primary - Fully Implemented)**
   - `pdf-lib`: Core PDF manipulation (combine, split, reorder, watermark, page numbers)
   - `pdf-parse`: Text extraction from PDF documents
   - `pdf2pic`: PDF to image conversion for analysis
   - `sharp`: High-performance image analysis for whitespace detection
   - **Advantage**: No external dependencies, works standalone, easy deployment

**2. Python MCP Server (Optional Enhancement)**
   - Reference implementation from [manus-hackathon](https://github.com/nolanhurlburt/manus-hackathon)
   - Can be integrated for advanced legal document features
   - Provides additional validation, citation extraction, and document break detection
   - **Advantage**: Specialized legal PDF tools, extensible via MCP protocol

### Technology Stack

**Frontend:**
- React 19 with TypeScript
- Tailwind CSS 4 for styling
- shadcn/ui component library
- Lucide React for icons
- assistant-ui for chat interface
- tRPC for type-safe API calls
- Wouter for routing

**Backend:**
- Express 4 server
- tRPC 11 for type-safe API layer
- Claude AI (Anthropic SDK) for natural language processing
- S3-compatible storage for file management
- MySQL/TiDB database (Drizzle ORM)
- Node.js PDF processing libraries

## Project Structure

```
client/
  src/
    components/
      ChatPanel.tsx          # AI chat interface with assistant-ui
      DocumentList.tsx       # PDF document management with upload
      OperationsReport.tsx   # Real-time operation history tracking
      ui/                    # shadcn/ui components
    pages/
      Home.tsx              # Main three-panel application layout
    index.css              # Tailwind configuration & Manus-inspired theme

server/
  services/
    pdfOperations.ts        # Core PDF manipulation (pdf-lib)
    whitespaceDetection.ts  # Image-based whitespace analysis (sharp)
  routes/
    pdfRouter.ts           # tRPC API endpoints with Claude integration
  _core/
    llm.ts                 # Claude AI integration helper
    trpc.ts                # tRPC configuration
  storage.ts               # S3 file storage helpers
    
drizzle/
  schema.ts                # Database schema (users table)

tests/
  server/routes/pdfRouter.test.ts  # Comprehensive API tests
```

## Getting Started

### Prerequisites
- Node.js 22+
- pnpm package manager
- Poppler utils (for PDF to image conversion)
- GraphicsMagick (for image processing)

### Installation

```bash
# Install dependencies
pnpm install

# Approve sharp build scripts (for image processing)
pnpm approve-builds sharp

# Install system dependencies (Ubuntu/Debian)
sudo apt-get install poppler-utils graphicsmagick

# Push database schema
pnpm db:push
```

### Development

```bash
# Start development server
pnpm dev

# Run tests
pnpm test

# Type check
pnpm check

# Format code
pnpm format
```

The application will be available at `http://localhost:3000`

## Usage

### Basic Workflow

1. **Upload a PDF**: Click the "Upload" button in the Documents panel
2. **Chat with the AI**: Type natural language commands like:
   - "Split this PDF into separate pages"
   - "Add a watermark that says CONFIDENTIAL"
   - "Check if there's content in the margins"
   - "Find a clear area for a signature"
3. **View Results**: Operations appear in real-time in the Operations Report panel
4. **Download**: Access processed PDFs from the Documents panel

### Example Commands

```
"Combine all my documents into one PDF"
"Split pages 1-5 into a separate file"
"Add page numbers at the bottom center"
"Check if the margins are clear for printing"
"Find a spot for a signature stamp"
"Extract text from page 3"
"Reorder pages: put page 5 first"
"Add a DRAFT watermark to all pages"
```

## API Reference

### tRPC Endpoints

#### `pdf.upload`
Upload a PDF document to S3 storage
```typescript
input: {
  name: string;
  size: number;
  data: string; // base64 encoded PDF
}
returns: {
  id: string;
  name: string;
  type: "original";
  size: string;
  url: string;
  fileKey: string;
}
```

#### `pdf.list`
Get all PDF documents for the current user
```typescript
returns: Array<{
  id: string;
  name: string;
  type: "original" | "revised";
  size: string;
  uploadedAt: Date;
  url: string;
}>
```

#### `pdf.operations`
Get operation history
```typescript
returns: Array<{
  id: string;
  type: string;
  description: string;
  status: "completed" | "in-progress" | "failed";
  timestamp: Date;
  details?: string;
}>
```

#### `pdf.chat`
Send a natural language command to Claude AI
```typescript
input: {
  message: string;
  documentIds?: string[];
}
returns: {
  message: string;
  operation: Operation;
  needsFiles: boolean;
}
```

#### `pdf.execute`
Execute a specific PDF operation
```typescript
input: {
  operation: "combine" | "split" | "reorder" | "watermark" | 
             "page_numbers" | "extract_text" | "check_margins" | 
             "check_page_numbers" | "find_whitespace";
  documentId: string;
  parameters: Record<string, any>;
}
returns: {
  success: boolean;
  result: any;
}
```

## Implementation Details

### PDF Operations (`server/services/pdfOperations.ts`)

All core PDF operations use `pdf-lib` for maximum compatibility:

- **combinePDFs**: Merges pages from multiple PDFs sequentially
- **splitPDF**: Creates new PDFs from page ranges (1-indexed, inclusive on both ends)
- **movePages**: Copies pages in specified order to create reordered PDF
- **addWatermark**: Draws centered text overlay on all pages with configurable opacity
- **addPageNumbers**: Adds sequential numbers in 6 configurable positions
- **extractText**: Uses `pdf-parse` for full-text extraction

### Whitespace Detection (`server/services/whitespaceDetection.ts`)

Advanced image-based analysis matching Python implementation:

**checkMarginWhitespace**
1. Convert PDF pages to PNG images (configurable DPI)
2. Analyze pixel brightness in margin areas (top/bottom/left/right)
3. Detect dark pixels (content) below threshold (default 250/255)
4. Return per-page margin issue report

**checkPageNumberWhitespace**
1. Convert PDF pages to images
2. Check 6 standard positions (top/bottom × left/center/right)
3. Scan rectangular regions (0.75" × 0.25") for clear space
4. Return percentage of clear positions per page

**findWhitespace**
1. Convert pages to grayscale images
2. Scan for clear rectangular regions of minimum size
3. Score candidates by preference (bottom-right, top-left, etc.)
4. Return best region coordinates in inches

### Claude AI Integration (`server/routes/pdfRouter.ts`)

The chat interface uses structured JSON output from Claude:

1. **System Prompt**: Defines available operations and response format
2. **JSON Schema**: Enforces structured responses (operation, parameters, explanation)
3. **Intent Recognition**: Maps natural language to specific PDF operations
4. **Parameter Extraction**: Pulls operation-specific parameters from context
5. **Friendly Responses**: Generates user-friendly explanations

## Testing

Comprehensive test suite using Vitest (16 tests, all passing):

```bash
# Run all tests
pnpm test

# Watch mode for development
pnpm test --watch

# Coverage report
pnpm test --coverage
```

**Test Coverage:**
- PDF router endpoints (upload, list, operations, chat, execute)
- Authentication requirements for protected routes
- Chat message processing with various intents
- Operation execution with parameter validation
- Error handling and graceful degradation

## Deployment

Designed for Manus platform with:
- **Built-in Authentication**: Manus OAuth (no setup required)
- **S3 Storage**: Automatic file management
- **Managed Database**: MySQL/TiDB with Drizzle ORM
- **Automatic SSL/TLS**: Secure by default
- **Environment Variables**: Pre-configured system envs

### Environment Variables (Auto-configured on Manus)
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Session signing secret
- `BUILT_IN_FORGE_API_URL` - Manus APIs base URL
- `BUILT_IN_FORGE_API_KEY` - API authentication token
- `VITE_APP_ID` - OAuth application ID
- `OAUTH_SERVER_URL` - OAuth backend URL

## Design Philosophy

Clean, professional interface inspired by Manus:

- **Light Theme**: Soft grays, subtle blues, professional appearance
- **Three-Panel Layout**: Chat (left), Documents (center), Operations (right)
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Smooth Interactions**: Transitions, loading states, error handling
- **Accessible**: Keyboard navigation, ARIA labels, semantic HTML
- **Typography**: Clean sans-serif with proper hierarchy

## Performance

- **Fast PDF Operations**: In-memory processing with pdf-lib
- **Efficient Image Analysis**: Sharp for high-performance pixel operations
- **Optimistic Updates**: Instant UI feedback with background processing
- **Lazy Loading**: Components load on demand
- **Type Safety**: End-to-end TypeScript with tRPC

## Future Enhancements

- [ ] PDF preview with page thumbnails
- [ ] Batch operations on multiple documents
- [ ] Custom operation workflows
- [ ] Export operations history as report
- [ ] Advanced text search across documents
- [ ] OCR for scanned documents
- [ ] Digital signature support
- [ ] Form field editing
- [ ] Annotation tools

## MCP Server Integration (Optional)

To integrate the Python FastMCP server from manus-hackathon:

1. Clone the hackathon repo: `gh repo clone nolanhurlburt/manus-hackathon`
2. Install Python dependencies: `pip install -r requirements.txt`
3. Start the MCP server: `python -m legal_pdf_tools.server`
4. Update `server/routes/pdfRouter.ts` to call MCP endpoints
5. Add MCP client library: `pnpm add @modelcontextprotocol/client`

This provides additional features:
- Document break detection with AI
- Citation extraction (legal documents)
- Bookmark and link validation
- Word to PDF conversion

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run tests: `pnpm test`
5. Type check: `pnpm check`
6. Format code: `pnpm format`
7. Commit with clear message
8. Push and create a Pull Request

## License

MIT

## Acknowledgments

- **Manus Hackathon**: Original Python implementation of legal-pdf-tools
- **assistant-ui**: Excellent React chat interface library
- **Claude AI**: Powerful natural language understanding
- **shadcn/ui**: Beautiful, accessible component library
- **pdf-lib**: Robust PDF manipulation in JavaScript

---

Built with ❤️ for the Manus Hackathon
