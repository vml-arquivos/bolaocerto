import { Logger } from '@nestjs/common';

/**
 * Assinatura digital da contratante com certificado ICP-Brasil (e-CNPJ A1, arquivo .pfx/.p12).
 * É opcional: sem as variáveis CONTRATO_CERTIFICADO_A1_BASE64 e CONTRATO_CERTIFICADO_SENHA o PDF sai como antes.
 * Qualquer falha também devolve o PDF sem a assinatura digital, para nunca travar o download.
 */
const logger = new Logger('ContratoIcp');

type IcpConfig = { certificate: Buffer; password: string };

export function icpConfig(env: NodeJS.ProcessEnv = process.env): IcpConfig | null {
  const raw = (env.CONTRATO_CERTIFICADO_A1_BASE64 ?? '').replace(/\s+/g, '');
  if (!raw) return null;
  const certificate = Buffer.from(raw, 'base64');
  if (certificate.length < 100) return null;
  return { certificate, password: env.CONTRATO_CERTIFICADO_SENHA ?? '' };
}

export function icpEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return icpConfig(env) !== null;
}

/** Assina o PDF (PAdES/CMS destacado). Devolve `assinado: false` quando não há certificado ou algo falha. */
export async function signPdfWithCompanyCertificate(pdf: Buffer, info: { reason: string; location: string; name: string; contactInfo?: string }, env: NodeJS.ProcessEnv = process.env): Promise<{ buffer: Buffer; assinado: boolean }> {
  const config = icpConfig(env);
  if (!config) return { buffer: pdf, assinado: false };
  try {
    const [{ SignPdf }, { plainAddPlaceholder }, { P12Signer }] = await Promise.all([
      import('@signpdf/signpdf'),
      import('@signpdf/placeholder-plain'),
      import('@signpdf/signer-p12'),
    ]);
    const withPlaceholder = plainAddPlaceholder({
      pdfBuffer: pdf,
      reason: info.reason.slice(0, 200),
      location: info.location.slice(0, 120),
      name: info.name.slice(0, 120),
      contactInfo: (info.contactInfo ?? '').slice(0, 120),
      signatureLength: 16384,
    });
    const signer = new P12Signer(config.certificate, { passphrase: config.password });
    const signed = await new SignPdf().sign(withPlaceholder, signer);
    return { buffer: Buffer.from(signed), assinado: true };
  } catch (error) {
    logger.warn(`PDF do contrato saiu sem o certificado digital: ${error instanceof Error ? error.message : String(error)}`);
    return { buffer: pdf, assinado: false };
  }
}

export type IcpInfo = { configurado: boolean; titular?: string | null; emissor?: string | null; validoAte?: string | null; vencido?: boolean; erro?: string };
const FORGE = 'node-forge';
let cachedInfo: { key: string; info: IcpInfo } | null = null;

/** Titular e validade do certificado, para mostrar no painel (sem expor nada sigiloso). */
export async function icpInfo(env: NodeJS.ProcessEnv = process.env): Promise<IcpInfo> {
  const config = icpConfig(env);
  if (!config) return { configurado: false };
  const key = `${config.certificate.length}:${config.certificate.subarray(0, 32).toString('hex')}:${config.password.length}`;
  if (cachedInfo?.key === key) return cachedInfo.info;
  let info: IcpInfo;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forge: any = await import(FORGE);
    const lib = forge.default ?? forge;
    const asn1 = lib.asn1.fromDer(lib.util.createBuffer(config.certificate.toString('binary')));
    const p12 = lib.pkcs12.pkcs12FromAsn1(asn1, false, config.password);
    const bags = p12.getBags({ bagType: lib.pki.oids.certBag })[lib.pki.oids.certBag] ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const certs = bags.map((bag: any) => bag.cert).filter(Boolean);
    // O certificado do titular é o que não emite nenhum outro da cadeia.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaf = certs.find((cert: any) => !certs.some((other: any) => other !== cert && other.issuer.hash === cert.subject.hash)) ?? certs[0];
    const until: Date | null = leaf?.validity?.notAfter ?? null;
    info = {
      configurado: true,
      titular: leaf?.subject?.getField('CN')?.value ?? null,
      emissor: leaf?.issuer?.getField('CN')?.value ?? null,
      validoAte: until ? until.toISOString() : null,
      vencido: until ? until.getTime() < Date.now() : false,
    };
  } catch (error) {
    info = { configurado: true, erro: error instanceof Error && /MAC|password/i.test(error.message) ? 'Senha do certificado incorreta.' : 'Não foi possível ler o certificado.' };
  }
  cachedInfo = { key, info };
  return info;
}
