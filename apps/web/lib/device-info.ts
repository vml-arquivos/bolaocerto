/** Dados do aparelho registrados junto com a assinatura eletrônica (localização só quando a pessoa autoriza). */
export type DeviceInfo = { latitude?: number; longitude?: number; precisao?: number; localNegado?: boolean; fuso?: string; idioma?: string };

export function deviceInfo(timeoutMs = 9000): Promise<DeviceInfo> {
  const base: DeviceInfo = {};
  try { base.fuso = Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 60); } catch { /* sem fuso */ }
  try { base.idioma = navigator.language?.slice(0, 30); } catch { /* sem idioma */ }
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve({ ...base, localNegado: true });
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: DeviceInfo) => { if (!done) { done = true; resolve(value); } };
    const timer = window.setTimeout(() => finish({ ...base, localNegado: true }), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => { window.clearTimeout(timer); finish({ ...base, latitude: position.coords.latitude, longitude: position.coords.longitude, precisao: Math.round(position.coords.accuracy) }); },
        () => { window.clearTimeout(timer); finish({ ...base, localNegado: true }); },
        { enableHighAccuracy: true, timeout: timeoutMs - 500, maximumAge: 60_000 },
      );
    } catch {
      window.clearTimeout(timer);
      finish({ ...base, localNegado: true });
    }
  });
}

/** Link do mapa para conferir a localização registrada. */
export function mapLink(latitude: unknown, longitude: unknown): string | null {
  return typeof latitude === 'number' && typeof longitude === 'number' ? `https://www.google.com/maps?q=${latitude},${longitude}` : null;
}
