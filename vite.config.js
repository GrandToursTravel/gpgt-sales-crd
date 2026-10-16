import { defineConfig, loadEnv } from "vite";

/* Runs the Vercel functions in api/ inside the Vite dev server, so
   `npm run dev` gives the whole thing - page, race calendar and enquiry
   endpoint - without the Vercel CLI. In production Vercel runs api/ itself
   and this plugin is not involved.

   Each api/<name>.js exports a function per HTTP method taking a Web
   Request and returning a Response, which is the shape Vercel calls. */
function localApi() {
  return {
    name: "local-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = /^\/api\/([a-z0-9-]+)\/?(?:\?|$)/.exec(req.url || "");
        if (!match) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.js`);
          const handler = mod[req.method];
          if (typeof handler !== "function") {
            res.statusCode = 405;
            return res.end();
          }
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const request = new Request(new URL(req.url, "http://localhost"), {
            method: req.method,
            headers: req.headers,
            body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.ssrFixStacktrace(err);
          console.error(err);
          res.statusCode = 500;
          res.end("Local API error - see the terminal");
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  /* Server-side variables (RACES_CSV_URL etc.) from .env.local, for the local
     API only. Nothing without a VITE_ prefix reaches the browser bundle. */
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [localApi()],
    build: {
      /* The globe texture and the photos are already WebP; inlining small
         ones as data: URIs again would undo the point of the split. */
      assetsInlineLimit: 0,
    },
  };
});
