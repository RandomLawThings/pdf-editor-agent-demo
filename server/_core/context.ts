import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { getSessionIdFromRequest, generateSessionId } from "./session";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  sessionId: string | null;
};

// Create a session-scoped mock user for standalone mode
function createStandaloneUser(sessionId: string): User {
  return {
    // Use a hash of the session ID as a numeric user ID for compatibility
    id: parseInt(sessionId.slice(0, 8), 16),
    openId: `session-${sessionId}`,
    name: "Demo User",
    email: `demo-${sessionId.slice(0, 8)}@localhost`,
    loginMethod: "standalone",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let sessionId: string | null = null;

  // In standalone mode, use session-based isolation
  if (ENV.standaloneMode) {
    sessionId = getSessionIdFromRequest(opts.req);
    if (sessionId) {
      user = createStandaloneUser(sessionId);
    }
    // If no session ID, user remains null - client must provide one
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    sessionId,
  };
}
