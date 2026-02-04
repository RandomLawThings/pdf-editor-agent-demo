// Polyfills must be imported first, before any pdf2pic/pdfjs-dist
import "./polyfills";
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import { UPLOADS_DIR } from "../storage";
import { getSessionIdFromRequest, extractSessionIdFromKey } from "./session";

// Detect Vercel environment
const isVercel = !!process.env.VERCEL;

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Create Express app
const app = express();

// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve uploaded files in standalone mode
// Security: Session-scoped files are under /uploads/sessions/{32-char-session-id}/...
// The 128-bit random session ID makes paths effectively unguessable
if (ENV.standaloneMode) {
  app.use("/uploads", (req, res, next) => {
    const requestPath = req.path;

    // Prevent path traversal attacks
    if (requestPath.includes('..') || requestPath.includes('//')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    // Validate session-scoped paths have correct format
    // req.path is like /sessions/{sessionId}/... so we strip the leading /
    if (requestPath.startsWith('/sessions/')) {
      const pathSessionId = extractSessionIdFromKey(requestPath.slice(1));
      if (!pathSessionId) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }

    next();
  }, express.static(UPLOADS_DIR));
}

// OAuth callback under /api/oauth/callback
registerOAuthRoutes(app);

// tRPC API
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// For Vercel: serve static files (production mode)
// Vite dev server setup happens in startServer() for local dev
if (isVercel) {
  serveStatic(app);
}

async function startServer() {
  const server = createServer(app);

  // Log startup mode
  if (ENV.standaloneMode) {
    console.log("\n🚀 Starting in STANDALONE MODE (no Manus required)");
    console.log("   - Authentication: Bypassed (dev user)");
    console.log("   - Storage: Local filesystem (./uploads)");
    console.log(`   - LLM: ${ENV.anthropicApiKey ? "Claude (Anthropic API)" : "⚠️  No ANTHROPIC_API_KEY set!"}`);
    if (!ENV.anthropicApiKey) {
      console.log("   ⚠️  Set ANTHROPIC_API_KEY in .env or environment to enable AI features\n");
    }
  }

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

// Only start the server if not running in Vercel serverless environment
if (!isVercel) {
  startServer().catch(console.error);
}

// Export app for Vercel serverless function
export default app;
