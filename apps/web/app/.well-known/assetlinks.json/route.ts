// Digital Asset Links: liga o site ao app Android (TWA) para ele abrir em tela cheia, sem barra do Chrome.
// Preencha ANDROID_PACKAGE_NAME / ANDROID_SHA256_CERT_FINGERPRINTS (cliente) e ANDROID_ADMIN_PACKAGE_NAME / ANDROID_ADMIN_SHA256_CERT_FINGERPRINTS (painel) no Coolify.
export const dynamic = 'force-dynamic';

export function GET() {
  const entry = (pkgName?: string, printsRaw?: string) => {
    const pkg = pkgName?.trim();
    const prints = (printsRaw ?? '').split(',').map(item => item.trim().toUpperCase()).filter(Boolean);
    return pkg && prints.length ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints } }] : [];
  };
  // Dois apps: o do cliente e o do painel (equipe), cada um com seu pacote e sua chave.
  const body = [...entry(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_SHA256_CERT_FINGERPRINTS), ...entry(process.env.ANDROID_ADMIN_PACKAGE_NAME, process.env.ANDROID_ADMIN_SHA256_CERT_FINGERPRINTS)];
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
