/**
 * config.js - Frontend configuration
 *
 * VPS deployment: '/api' is reverse-proxied by nginx to the FastAPI backend
 * (see docker/nginx/nginx.conf). Keeps API on the same domain - no CORS.
 *
 * For local development: Leave as-is, it will auto-detect localhost:5001
 */
window.GLITCHGARB_API_URL = '/api';
window.FRONTEND_URL = 'https://glitchgarb.com';
