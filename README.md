# Webhook Mercado Pago Seguro

> Valida a assinatura x-signature das notificações do Mercado Pago com HMAC-SHA256, comparação em tempo constante e janela anti-replay. Só libera pedido de pagamento verdadeiro.

**Ver ao vivo, com preview e manual:** https://flowcoresolucoes.com.br/codigos/webhook-mercado-pago

Criado por **FlowCore Soluções LTDA**.

## Arquivos

- [`src/webhook-mercadopago.ts`](src/webhook-mercadopago.ts)
- [`src/webhook-mercadopago.test.ts`](src/webhook-mercadopago.test.ts)

## Como instalar

1. **Funciona onde você já roda** Node 18+, Cloudflare Workers, Deno, Bun, Vercel e Netlify Functions. Zero dependência: só fetch e Web Crypto, que já vêm no runtime.
2. **Crie src/lib/webhook-mercadopago.ts** Copie o conteúdo de `src/webhook-mercadopago.ts` e `src/webhook-mercadopago.test.ts` deste repositório.
3. **Use**

   ```bash
   const r = await validarRequestMercadoPago(request, env.MP_WEBHOOK_SECRET);
   if (!r.valido) return new Response("assinatura inválida", { status: 401 });
   // segue: buscar o pagamento pela API e atualizar o pedido
   ```

4. **Rode o teste junto** O arquivo de teste (`src/webhook-mercadopago.test.ts`) cobre 8 cenários. Copie para src/lib/ ao lado e rode:

   ```bash
   npm install -D vitest
   npx vitest run src/lib
   ```


## Testes

`src/webhook-mercadopago.test.ts` cobre 8 cenários.

```bash
npm install
npm test
```

## Licença

MIT. Pode usar em projeto pessoal ou comercial, de graça. A única condição é manter a linha **“Criado por FlowCore Soluções LTDA”** (ou o crédito de adaptação) onde ela está.

---

Precisa disso integrado no seu sistema? A [FlowCore](https://flowcoresolucoes.com.br) desenvolve sob medida.
