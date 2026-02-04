// Vercel serverless function entry point
// Re-exports the Express app for Vercel's serverless runtime
// Import from the bundled output (dist/index.js), not source files

import app from '../dist/index.js';

export default app;
