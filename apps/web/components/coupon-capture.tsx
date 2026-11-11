'use client';
import { useEffect } from 'react';

export const COUPON_STORAGE_KEY = 'bl-cupom';
const CODE = /^[A-Za-z0-9_-]{3,60}$/;

/** Guarda o cupom que veio no link (?cupom=CODIGO) para o formulário de compra usar depois, mesmo que a pessoa ainda precise entrar na conta. */
export function CouponCapture() {
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get('cupom')?.trim();
      if (code && CODE.test(code)) window.sessionStorage.setItem(COUPON_STORAGE_KEY, code.toUpperCase());
    } catch { /* sem sessionStorage: a pessoa digita o código na compra */ }
  }, []);
  return null;
}

export function readStoredCoupon(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('cupom')?.trim();
    const code = fromUrl || window.sessionStorage.getItem(COUPON_STORAGE_KEY) || '';
    return CODE.test(code) ? code.toUpperCase() : '';
  } catch { return ''; }
}

export function clearStoredCoupon() {
  try { window.sessionStorage.removeItem(COUPON_STORAGE_KEY); } catch { /* ignora */ }
}
