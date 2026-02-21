import cors from "cors";
import express from "express";
import { CopilotRuntime, AnthropicAdapter, copilotRuntimeNodeHttpEndpoint } from "@copilotkit/runtime";

const app = express();
app.use(cors());

const serviceAdapter = new AnthropicAdapter({
  model: "claude-sonnet-4-20250514",
});

const runtime = new CopilotRuntime();

const handler = copilotRuntimeNodeHttpEndpoint({
  endpoint: "/api/copilotkit",
  runtime,
  serviceAdapter,
});

// Mount without path prefix so req.url preserves the full path for the Hono router
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api/copilotkit")) {
    const result = handler(req, res);
    if (result instanceof Promise) {
      result.catch(next);
    }
  } else {
    next();
  }
});

const PORT = 4200;
app.listen(PORT, () => {
  console.log(`CopilotKit server running on http://localhost:${PORT}`);
});
