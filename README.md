# Landing — Guia PIS, Cofins e CBS · Benício Advogados

Página estática + uma função serverless que envia cada lead por e-mail para
**novosnegocios@benicio.com.br** usando o [Resend](https://resend.com).

```
benicio-site/
├── index.html                          página completa (imagens em base64, sem dependências)
├── api/lead.js                         função serverless: valida e envia o e-mail
├── guia-pis-cofins-cbs-benicio.pdf     material entregue ao lead
├── vercel.json                         cabeçalhos de segurança e do download
└── package.json
```

## Entrega do material

Assim que o `/api/lead` responde `ok`, a página dispara o download do PDF automaticamente
e mostra um botão **Baixar o guia** como alternativa — alguns navegadores bloqueiam
downloads programáticos. O `vercel.json` serve o arquivo com `Content-Disposition: attachment`,
então ele baixa em vez de abrir no visualizador.

Para trocar o material, substitua `guia-pis-cofins-cbs-benicio.pdf` mantendo o mesmo nome
(ou ajuste `GUIA` e `GUIA_NOME` no script do `index.html` e o `source` no `vercel.json`).

> Enquanto a `RESEND_API_KEY` não estiver configurada, o envio falha e **o download não
> acontece** — o visitante vê a mensagem de erro. Configure a chave antes de divulgar a página.

## 1. Resend

1. Crie a conta em resend.com.
2. **Domains → Add Domain** → `benicio.com.br`. Publique os registros DNS que ele mostra
   (SPF, DKIM e, de preferência, DMARC). Sem domínio verificado o Resend só entrega para
   o e-mail dono da conta.
3. **API Keys → Create API Key** (permissão *Sending access*). Copie a chave `re_...`.

## 2. Deploy na Vercel

```bash
cd benicio-site
npx vercel        # preview
npx vercel --prod # produção
```

Ou arraste a pasta em vercel.com/new. Não há build step — é estático + função.

## 3. Variáveis de ambiente

Vercel → **Settings → Environment Variables** (marque Production, Preview e Development):

| Variável | Obrigatória | Valor |
|---|---|---|
| `RESEND_API_KEY` | sim | a chave `re_...` do passo 1 |
| `LEAD_FROM` | não | `Site Benício <site@benicio.com.br>` — precisa ser do domínio verificado |
| `LEAD_TO` | não | padrão `novosnegocios@benicio.com.br` |
| `LEAD_BCC` | não | cópia oculta, ex. um endereço do CRM |

Depois de criar as variáveis, **faça um novo deploy** — elas só valem a partir do próximo build.

## 4. Teste

Preencha o formulário no site publicado. O e-mail chega formatado, com `Reply-To`
apontando para o lead — basta responder para falar com ele.

Se algo falhar, o visitante vê um aviso com o e-mail de contato e o erro aparece em
**Vercel → Deployments → Functions → /api/lead** (logs).

## Comportamento e proteções

- Validação nos dois lados: nome com sobrenome, e-mail com formato válido, telefone com
  10 ou 11 dígitos, regime dentro da lista, consentimento LGPD obrigatório.
- Campo honeypot invisível (`website`): se vier preenchido, o envio é descartado em silêncio.
- Rate limit de 6 envios por IP a cada 10 minutos.
- Nenhum dado é gravado em disco — o e-mail é o único destino.

## Rodando localmente

`npx vercel dev` (a função precisa da `RESEND_API_KEY` em um `.env.local`).
Abrir o `index.html` direto pelo navegador exibe a página, mas o envio falha:
não existe `/api/lead` fora do servidor.
# benicio-landingpage
