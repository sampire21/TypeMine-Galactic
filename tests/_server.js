// Starts a private copy of the local adapter (server.js) with an empty in-memory store, so a spec can
// sign up throwaway users without touching the shared dev server on :3000 or its signup rate limits.
// Not a test file: the unit runner only picks up tests/*.test.js and Playwright only tests/*.spec.js.
const { createApp } = require('../server.js');

async function startTestServer() {
    const app = createApp({ port: 0, dataFile: null, tokenSecret: 'test-secret-0123456789abcdef', adminUsername: 'boss', trustProxy: true, quiet: true });
    const port = await app.start();
    return { app, base: `http://localhost:${port}`, stop: () => app.stop() };
}

module.exports = { startTestServer };
