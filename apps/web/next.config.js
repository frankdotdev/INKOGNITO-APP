const fs = require('fs'), path = require('path');
const has = d => (fs.existsSync(path.join(__dirname, 'content', 'legal', d + '.md')) ? '1' : '');
module.exports = {
  transpilePackages: ['@inkognito/core'],
  env: { NEXT_PUBLIC_HAS_TERMS: has('terms'), NEXT_PUBLIC_HAS_PRIVACY_POLICY: has('privacy') },
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/(.*)', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ] },
    ];
  },
};
