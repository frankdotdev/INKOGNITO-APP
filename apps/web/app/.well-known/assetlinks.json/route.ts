// Digital Asset Links: lets an Android Trusted Web Activity app open this site full-screen. Active only when configured.
export const dynamic = 'force-dynamic';
export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!pkg || fingerprints.length === 0) return new Response('Not found', { status: 404 });
  return Response.json([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fingerprints } }]);
}
