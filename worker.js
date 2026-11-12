// Cloudflare Worker entry. The request router and security headers live in
// functions/api/_router.js so the local Node adapter (server.js) can run the exact same code.
import { handleApiRequest, applySecurityHeaders } from './functions/api/_router.js';

export { handleApiRequest, applySecurityHeaders };

export default {
  async fetch(request, env, ctx) {
    const apiResponse = await handleApiRequest(request, env, ctx);
    if (apiResponse) return apiResponse;
    const assetRes = await env.ASSETS.fetch(request);
    return applySecurityHeaders(assetRes, request);
  },
};
