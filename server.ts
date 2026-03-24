import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { AccessToken } from "livekit-server-sdk";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // LiveKit Token Generation Endpoint
  app.get("/api/livekit/token", async (req, res) => {
    const { room, identity, name } = req.query;
    console.log(`[Server] Token request: room=${room}, identity=${identity}, name=${name}`);

    if (!room || !identity) {
      console.warn("[Server] Missing room or identity in token request");
      return res.status(400).json({ error: "Missing room or identity" });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error("[Server] LIVEKIT_API_KEY or LIVEKIT_API_SECRET is missing");
      return res.status(500).json({ error: "LiveKit API Key or Secret not configured on server" });
    }

    try {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: identity as string,
        name: (name as string) || (identity as string),
      });

      at.addGrant({
        roomJoin: true,
        room: room as string,
        canPublish: true,
        canSubscribe: true,
      });

      const token = await at.toJwt();
      console.log(`[Server] Token generated successfully for ${identity} in ${room}`);
      res.json({ token });
    } catch (error) {
      console.error("[Server] Error generating LiveKit token:", error);
      res.status(500).json({ error: "Internal server error during token generation" });
    }
  });

  // Catch-all for API routes to prevent Vite from serving index.html for missing API endpoints
  app.all("/api/*", (req, res) => {
    console.warn(`[Server] Unhandled API request: ${req.method} ${req.url}`);
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.url}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
