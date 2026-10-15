// webhook-mercadopago.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
// Valida a assinatura (header x-signature) das notificações Webhook do
// Mercado Pago antes de liberar pedido: HMAC-SHA256 sobre o manifesto
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;", comparação em tempo
// constante e janela de tolerância contra replay.
// Roda em Node 18+, Cloudflare Workers, Deno e Bun.
// Zero dependências.
//
// Referência: Mercado Pago Developers, "Webhooks > Validar origem da notificação".

export const CRIADO_POR = "Criado por FlowCore Soluções LTDA";

export type EntradaAssinaturaMP = {
  /** Valor do header x-signature, ex.: "ts=1704908010,v1=618c85...". */
  xSignature: string | null | undefined;
  /** Valor do header x-request-id. */
  xRequestId: string | null | undefined;
  /** Query param "data.id" da URL da notificação. */
  dataId: string | null | undefined;
  /** Assinatura secreta do painel "Suas integrações > Webhooks". */
  segredo: string;
  /** Diferença máxima entre ts e agora, em segundos. Padrão 300. 0 desliga. */
  toleranciaSegundos?: number;
  now?: () => number;
};

export type ResultadoAssinaturaMP =
  | { valido: true; ts: number }
  | { valido: false; motivo: "HEADER_AUSENTE" | "HEADER_MALFORMADO" | "FORA_DA_JANELA" | "ASSINATURA_INVALIDA" };

const enc = new TextEncoder();

async function hmacHex(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(mensagem)));
  let hex = "";
  for (let i = 0; i < sig.length; i++) hex += sig[i].toString(16).padStart(2, "0");
  return hex;
}

/** Compara strings em tempo constante (não vaza onde está a diferença). */
export function compararSeguro(a: string, b: string): boolean {
  let dif = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return dif === 0;
}

/** Lê "ts=...,v1=..." (ordem e espaços livres). */
export function lerXSignature(header: string): { ts: string; v1: string } | null {
  const partes: Record<string, string> = {};
  for (const item of header.split(",")) {
    const i = item.indexOf("=");
    if (i > 0) partes[item.slice(0, i).trim()] = item.slice(i + 1).trim();
  }
  if (!partes.ts || !partes.v1 || !/^\d+$/.test(partes.ts) || !/^[0-9a-f]{64}$/i.test(partes.v1)) return null;
  return { ts: partes.ts, v1: partes.v1.toLowerCase() };
}

/**
 * Monta o manifesto. Pela documentação, partes ausentes na notificação são omitidas,
 * e o data.id alfanumérico vai em minúsculas.
 */
export function montarManifesto(dataId: string | null | undefined, xRequestId: string | null | undefined, ts: string): string {
  let m = "";
  if (dataId) m += `id:${/[a-z]/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (xRequestId) m += `request-id:${xRequestId};`;
  return m + `ts:${ts};`;
}

/** Gera o header x-signature (útil pra testes e pra simular notificações). */
export async function gerarXSignature(p: { dataId?: string; xRequestId?: string; ts: number | string; segredo: string }) {
  const ts = String(p.ts);
  return `ts=${ts},v1=${await hmacHex(p.segredo, montarManifesto(p.dataId, p.xRequestId, ts))}`;
}

export async function validarAssinaturaMercadoPago(e: EntradaAssinaturaMP): Promise<ResultadoAssinaturaMP> {
  if (!e.segredo) throw new Error("Segredo do webhook do Mercado Pago não configurado");
  if (!e.xSignature) return { valido: false, motivo: "HEADER_AUSENTE" };
  const sig = lerXSignature(e.xSignature);
  if (!sig) return { valido: false, motivo: "HEADER_MALFORMADO" };

  const tsNum = Number(sig.ts);
  const tolerancia = e.toleranciaSegundos ?? 300;
  if (tolerancia > 0) {
    // O ts pode vir em segundos ou milissegundos, dependendo do produto.
    const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
    const agora = (e.now ?? Date.now)();
    if (Math.abs(agora - tsMs) > tolerancia * 1000) return { valido: false, motivo: "FORA_DA_JANELA" };
  }

  const esperado = await hmacHex(e.segredo, montarManifesto(e.dataId, e.xRequestId, sig.ts));
  return compararSeguro(esperado, sig.v1) ? { valido: true, ts: tsNum } : { valido: false, motivo: "ASSINATURA_INVALIDA" };
}

/** Atalho pra um Request (Workers, Next.js, Hono, Deno): lê headers e o data.id da URL. */
export async function validarRequestMercadoPago(
  req: { url: string; headers: { get(nome: string): string | null } },
  segredo: string,
  opcoes: { toleranciaSegundos?: number; now?: () => number } = {},
): Promise<ResultadoAssinaturaMP> {
  const url = new URL(req.url);
  return validarAssinaturaMercadoPago({
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId: url.searchParams.get("data.id") ?? url.searchParams.get("id"),
    segredo,
    ...opcoes,
  });
}
