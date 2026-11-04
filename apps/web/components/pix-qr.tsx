'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR Code gerado aqui mesmo a partir do Pix copia e cola: nítido, com margem branca e legível em qualquer banco. */
export function PixQr({ payload, size = 264, label = 'QR Code Pix' }: { payload: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    QRCode.toDataURL(payload, { width: size * 2, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0b1330', light: '#ffffff' } })
      .then((url) => { if (!off) setSrc(url); })
      .catch(() => { if (!off) setSrc(null); });
    return () => { off = true; };
  }, [payload, size]);
  if (!src) return <div className="pix-qr pix-qr-loading" style={{ width: size, height: size }} aria-label="Gerando o QR Code" />;
  return <img className="pix-qr" src={src} alt={label} width={size} height={size} />;
}
