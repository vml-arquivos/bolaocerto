/** Alertas do worker por webhook (mesma variável da API: ALERT_WEBHOOK_URL). Sem ela, só registra em log. */
const lastSent = new Map<string, number>();

export async function sendAlert(key: string, text: string, windowMs = 30 * 60_000, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) + windowMs > now) return false;
  lastSent.set(key, now);
  console.warn(JSON.stringify({ event: 'alerta', chave: key, texto: text }));
  const url = env.ALERT_WEBHOOK_URL?.trim();
  if (!url) return false;
  const message = `[${env.ALERT_ENV_LABEL || 'BL'}] ${text}`.slice(0, 1800);
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: message, content: message }), signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch (error) {
    console.error(JSON.stringify({ event: 'alerta.falhou', error: error instanceof Error ? error.message : String(error) }));
    return false;
  }
}
