// webhook-mercadopago.test.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
import { describe, expect, it } from "vitest";
import {
  compararSeguro,
  gerarXSignature,
  lerXSignature,
  montarManifesto,
  validarAssinaturaMercadoPago,
  validarRequestMercadoPago,
} from "./webhook-mercadopago";

const SEGREDO = "segredo-de-teste-mp";
const TS = 1_760_000_000; // segundos
const agora = () => TS * 1000 + 10_000;

/** HMAC calculado direto no teste, sem passar pelo módulo. */
async function hmacReferencia(segredo: string, msg: string) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("webhook-mercadopago", () => {
  it("monta o manifesto no formato da documentação", () => {
    expect(montarManifesto("123456", "req-1", "1700")).toBe("id:123456;request-id:req-1;ts:1700;");
    expect(montarManifesto("ABC99", "req-1", "1700")).toBe("id:abc99;request-id:req-1;ts:1700;");
    expect(montarManifesto(null, undefined, "1700")).toBe("ts:1700;");
  });

  it("gera assinatura igual ao HMAC calculado de forma independente", async () => {
    const header = await gerarXSignature({ dataId: "999", xRequestId: "abc", ts: TS, segredo: SEGREDO });
    const v1 = await hmacReferencia(SEGREDO, `id:999;request-id:abc;ts:${TS};`);
    expect(header).toBe(`ts=${TS},v1=${v1}`);
  });

  it("aceita notificação legítima", async () => {
    const xSignature = await gerarXSignature({ dataId: "999", xRequestId: "abc", ts: TS, segredo: SEGREDO });
    const r = await validarAssinaturaMercadoPago({ xSignature, xRequestId: "abc", dataId: "999", segredo: SEGREDO, now: agora });
    expect(r).toEqual({ valido: true, ts: TS });
  });

  it("recusa assinatura com segredo errado ou id trocado", async () => {
    const xSignature = await gerarXSignature({ dataId: "999", xRequestId: "abc", ts: TS, segredo: "outro" });
    const base = { xSignature, xRequestId: "abc", dataId: "999", segredo: SEGREDO, now: agora };
    expect(await validarAssinaturaMercadoPago(base)).toEqual({ valido: false, motivo: "ASSINATURA_INVALIDA" });
    const certo = await gerarXSignature({ dataId: "999", xRequestId: "abc", ts: TS, segredo: SEGREDO });
    expect(await validarAssinaturaMercadoPago({ ...base, xSignature: certo, dataId: "1000" })).toMatchObject({ valido: false });
  });

  it("recusa fora da janela de tolerância (replay) e aceita ts em milissegundos", async () => {
    const velho = await gerarXSignature({ dataId: "1", xRequestId: "r", ts: TS - 3600, segredo: SEGREDO });
    expect(
      await validarAssinaturaMercadoPago({ xSignature: velho, xRequestId: "r", dataId: "1", segredo: SEGREDO, now: agora }),
    ).toEqual({ valido: false, motivo: "FORA_DA_JANELA" });
    expect(
      await validarAssinaturaMercadoPago({ xSignature: velho, xRequestId: "r", dataId: "1", segredo: SEGREDO, now: agora, toleranciaSegundos: 0 }),
    ).toMatchObject({ valido: true });
    const emMs = await gerarXSignature({ dataId: "1", xRequestId: "r", ts: TS * 1000, segredo: SEGREDO });
    expect(
      await validarAssinaturaMercadoPago({ xSignature: emMs, xRequestId: "r", dataId: "1", segredo: SEGREDO, now: agora }),
    ).toMatchObject({ valido: true });
  });

  it("trata header ausente ou malformado", async () => {
    const base = { xRequestId: "r", dataId: "1", segredo: SEGREDO, now: agora };
    expect(await validarAssinaturaMercadoPago({ ...base, xSignature: null })).toEqual({ valido: false, motivo: "HEADER_AUSENTE" });
    expect(await validarAssinaturaMercadoPago({ ...base, xSignature: "ts=abc,v1=xyz" })).toEqual({
      valido: false,
      motivo: "HEADER_MALFORMADO",
    });
    await expect(validarAssinaturaMercadoPago({ ...base, xSignature: "x", segredo: "" })).rejects.toThrow("Segredo");
  });

  it("lê header com espaços e ordem invertida; compara em tempo constante", () => {
    const v1 = "a".repeat(64);
    expect(lerXSignature(` v1=${v1.toUpperCase()} , ts=123 `)).toEqual({ ts: "123", v1 });
    expect(compararSeguro("abc", "abc")).toBe(true);
    expect(compararSeguro("abc", "abd")).toBe(false);
    expect(compararSeguro("abc", "abcd")).toBe(false);
  });

  it("valida direto de um objeto Request (data.id da query)", async () => {
    const xSignature = await gerarXSignature({ dataId: "42", xRequestId: "req-9", ts: TS, segredo: SEGREDO });
    const headers = new Map([
      ["x-signature", xSignature],
      ["x-request-id", "req-9"],
    ]);
    const req = { url: "https://api.loja.com/webhook/mp?data.id=42&type=payment", headers: { get: (n: string) => headers.get(n) ?? null } };
    expect(await validarRequestMercadoPago(req, SEGREDO, { now: agora })).toEqual({ valido: true, ts: TS });
  });
});
