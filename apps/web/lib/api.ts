const internalApi = (process.env.API_INTERNAL_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

export async function apiGet<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${internalApi}${path}`, { cache: 'no-store' });
    if (!response.ok) return { data: null, error: `Serviço indisponível (HTTP ${response.status}).` };
    return { data: await response.json() as T, error: null };
  } catch {
    return { data: null, error: 'Não foi possível conectar ao serviço do BL.' };
  }
}
