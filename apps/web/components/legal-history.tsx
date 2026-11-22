'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PrintArea, printDocument } from './print-letterhead';
type Evidence = { cotaId?: string; textoHash?: string; hash?: string; textoSnapshot?: string | null; texto?: string; aceitoEm: string; pedidoSnapshot?: unknown };
export function LegalHistory() {
  const [items, setItems] = useState<Evidence[]>([]);
  const [message, setMessage] = useState('Carregando contratos…');
  useEffect(() => { void fetch('/api/v1/conta/contratos', { credentials: 'include', cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error(response.status === 401 ? 'Faça login para consultar seus contratos.' : 'Não foi possível consultar os contratos.');
    const data = await response.json(); const records = [...data.participacoes, ...data.afiliacao]; setItems(records); setMessage(records.length ? '' : 'Nenhum aceite registrado.');
  }).catch(error => setMessage(error.message)); }, []);
  return <><p>{message}</p><Link href="/minha-conta">Voltar à minha conta</Link><PrintArea>{items.map((item, i) => <details key={i}><summary>{item.cotaId ? `Participação ${item.cotaId.slice(0, 8)}` : 'Afiliação'} · {new Date(item.aceitoEm).toLocaleString('pt-BR')}</summary><div className="legal-text">{item.textoSnapshot || item.texto || 'Registro anterior: apenas o hash foi preservado. Solicite ao operador o documento original correspondente.'}</div><p>Hash: {item.textoHash || item.hash}</p>{Boolean(item.pedidoSnapshot) && <pre className="legal-text">{JSON.stringify(item.pedidoSnapshot, null, 2)}</pre>}</details>)}</PrintArea>{items.length > 0 && <button className="button" onClick={printDocument}>Imprimir / salvar PDF</button>}</>;
}
