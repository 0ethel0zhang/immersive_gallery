import cors from "cors";
import express from "express";
import { CopilotRuntime, AnthropicAdapter, copilotRuntimeNodeHttpEndpoint } from "@copilotkit/runtime";

const app = express();
app.use(cors());

const serviceAdapter = new AnthropicAdapter({
  model: "claude-sonnet-4-20250514",
});

const runtime = new CopilotRuntime({
  instructions:
    "You are an AI assistant for an immersive 3D art gallery. " +
    "The gallery displays artworks on an infinite canvas built with Three.js. " +
    "You can help users modify the gallery by changing colors, layout, adding decorative frames, and particle overlays. " +
    "Be concise and friendly. When the user asks you to do something, use the available actions to make it happen. " +
    "Describe what you did briefly after executing an action.",
});

const handler = copilotRuntimeNodeHttpEndpoint({
  endpoint: "/api/copilotkit",
  runtime,
  serviceAdapter,
});

// Mount without path prefix so req.url preserves the full path for the Hono router
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api/copilotkit")) {
    handler(req, res).catch(next);
  } else {
    next();
  }
});

const PORT = 4200;
app.listen(PORT, () => {
  console.log(`CopilotKit server running on http://localhost:${PORT}`);
});
