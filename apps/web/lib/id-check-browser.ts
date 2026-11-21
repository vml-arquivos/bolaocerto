'use client';
/* Leitura do documento no próprio aparelho: confere a foto e procura os dados com OCR (tesseract.js carregado só quando precisa). */
import { EMPTY_FOUND, finalReading, findInText, imageStats, manualReading, type IdExpected, type IdFound, type IdReading } from './id-check';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const OCR_TIMEOUT_MS = 90_000;

type TesseractWorker = { recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>; terminate: () => Promise<unknown> };
type TesseractLib = { createWorker: (lang: string, oem?: number, options?: { logger?: (m: { status: string; progress: number }) => void }) => Promise<TesseractWorker> };

let loading: Promise<TesseractLib> | null = null;

function loadTesseract(): Promise<TesseractLib> {
  const existing = (window as unknown as { Tesseract?: TesseractLib }).Tesseract;
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;
  loading = new Promise<TesseractLib>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => { const lib = (window as unknown as { Tesseract?: TesseractLib }).Tesseract; if (lib) resolve(lib); else reject(new Error('OCR indisponível')); };
    script.onerror = () => { loading = null; reject(new Error('OCR indisponível')); };
    document.head.appendChild(script);
  });
  return loading;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tempo esgotado')), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function drawScaled(source: CanvasImageSource, width: number, height: number, max: number, rotate = 0): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  const turned = rotate === 90 || rotate === 270;
  canvas.width = turned ? h : w;
  canvas.height = turned ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  return canvas;
}

function grayOf(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const { data } = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) gray[j] = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
  return gray;
}

const hits = (found: IdFound) => Object.values(found).filter((value) => value === true).length;

function merge(a: IdFound, b: IdFound): IdFound {
  const pick = (x: boolean | null, y: boolean | null) => (x === true || y === true ? true : x === false || y === false ? false : null);
  return { nome: pick(a.nome, b.nome), cpf: pick(a.cpf, b.cpf), rg: pick(a.rg, b.rg), nascimento: pick(a.nascimento, b.nascimento) };
}

export type AnalyzeResult = { leitura: IdReading; upload: Blob; nome: string };

/**
 * Confere a foto e lê o texto. PDF e formatos que o navegador não abre (HEIC no Android/Windows) vão para conferência manual.
 * Fotos grandes são reduzidas (até 2400 px, JPEG) antes do envio.
 */
export async function analyzeIdFile(file: File, expected: IdExpected, onProgress?: (text: string) => void): Promise<AnalyzeResult> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return { leitura: manualReading('PDF recebido: a administração confere.'), upload: file, nome: file.name };
  let bitmap: ImageBitmap | null = null;
  try { bitmap = await createImageBitmap(file); } catch { bitmap = null; }
  if (!bitmap) return { leitura: manualReading('Formato recebido: a administração confere.'), upload: file, nome: file.name };
  const width = bitmap.width;
  const height = bitmap.height;
  onProgress?.('Conferindo a foto…');
  const small = drawScaled(bitmap, width, height, 900);
  const stats = imageStats(grayOf(small), small.width, small.height);
  let upload: Blob = file;
  let name = file.name;
  if (file.size > 3 * 1024 * 1024 || Math.max(width, height) > 3000) {
    const big = drawScaled(bitmap, width, height, 2400);
    const jpeg = await new Promise<Blob | null>((resolve) => big.toBlob(resolve, 'image/jpeg', 0.9));
    if (jpeg && jpeg.size < file.size) { upload = jpeg; name = `${file.name.replace(/\.[^.]+$/, '') || 'documento'}.jpg`; }
  }
  let achou: IdFound = { ...EMPTY_FOUND };
  let confianca: number | null = null;
  let ocr = false;
  try {
    onProgress?.('Lendo o documento… isso pode levar alguns segundos.');
    const lib = await withTimeout(loadTesseract(), 20_000);
    const worker = await withTimeout(lib.createWorker('por', 1, { logger: (m) => { if (m.status === 'recognizing text') onProgress?.(`Lendo o documento… ${Math.round(m.progress * 100)}%`); } }), 40_000);
    try {
      for (const rotate of [0, 90, 270]) {
        const canvas = drawScaled(bitmap, width, height, 1800, rotate);
        const { data } = await withTimeout(worker.recognize(canvas), OCR_TIMEOUT_MS);
        const found = findInText(data.text, expected);
        achou = merge(achou, found);
        confianca = Math.max(confianca ?? 0, Math.round(data.confidence));
        ocr = true;
        if (hits(achou) >= 3 || data.confidence >= 60) break;
      }
    } finally { await worker.terminate().catch(() => undefined); }
  } catch {
    // Sem internet para o leitor ou aparelho lento: fica só a conferência da foto, e a administração confere o resto.
  }
  bitmap.close?.();
  return { leitura: finalReading({ largura: width, altura: height, brilho: stats.brilho, nitidez: stats.nitidez, confianca, achou, ocr }), upload, nome: name };
}
