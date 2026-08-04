/**
 * POST /api/lead
 * Recebe o formulário da landing e envia o lead por e-mail via Resend.
 *
 * Variáveis de ambiente (Vercel → Settings → Environment Variables):
 *   RESEND_API_KEY  obrigatória — chave da API do Resend (re_...)
 *   LEAD_TO         opcional — destinatário. Padrão: novosnegocios@benicio.com.br
 *   LEAD_FROM       opcional — remetente. Precisa ser de um domínio verificado no Resend.
 *                   Padrão: "Site Benício <site@benicio.com.br>"
 *   LEAD_BCC        opcional — cópia oculta (ex.: CRM, marketing)
 */

const DEFAULT_TO = 'novosnegocios@benicio.com.br';
const DEFAULT_FROM = 'Site Benício <site@benicio.com.br>';

const REGIMES = [
  'Lucro Real',
  'Lucro Presumido',
  'Simples Nacional',
  'Imune / Isenta',
  'Outro / Não sei informar',
];

// rate limit best-effort, por instância da função
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 6;
}

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function validate(b) {
  const errors = [];
  const nome = String(b.nome || '').trim();
  const empresa = String(b.empresa || '').trim();
  const regime = String(b.regime || '').trim();
  const email = String(b.email || '').trim();
  const tel = String(b.tel || '').trim();
  const digits = tel.replace(/\D/g, '');

  if (nome.length < 5 || nome.split(/\s+/).length < 2) errors.push('nome');
  if (empresa.length < 2) errors.push('empresa');
  if (!REGIMES.includes(regime)) errors.push('regime');
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) errors.push('email');
  if (digits.length < 10 || digits.length > 11) errors.push('tel');
  if (b.lgpd !== true && b.lgpd !== 'true') errors.push('lgpd');

  return { errors, data: { nome, empresa, regime, email, tel, digits } };
}

function template(d, meta) {
  const row = (k, v) => `
    <tr>
      <td style="padding:13px 0;border-bottom:1px solid #e6e3dd;width:170px;
                 font:500 10px/1.6 Helvetica,Arial,sans-serif;letter-spacing:.16em;
                 text-transform:uppercase;color:#6f6f69;vertical-align:top;">${esc(k)}</td>
      <td style="padding:13px 0;border-bottom:1px solid #e6e3dd;
                 font:400 15px/1.5 Helvetica,Arial,sans-serif;color:#0d0d0c;">${v}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:32px 16px;background:#f4f2ee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6e3dd;">
    <tr><td style="padding:34px 38px 26px;border-bottom:1px solid #e6e3dd;">
      <div style="font:400 17px/1 Georgia,serif;letter-spacing:.14em;color:#0d0d0c;">BENÍCIO</div>
      <div style="font:500 8px/1 Helvetica,Arial,sans-serif;letter-spacing:.42em;color:#6f6f69;margin-top:5px;">ADVOGADOS</div>
    </td></tr>
    <tr><td style="padding:34px 38px 10px;">
      <div style="font:500 10px/1.6 Helvetica,Arial,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#6f6f69;">Novo lead · Guia PIS, Cofins e CBS</div>
      <div style="font:400 27px/1.2 Georgia,serif;color:#0d0d0c;margin-top:12px;">${esc(d.empresa)}</div>
    </td></tr>
    <tr><td style="padding:18px 38px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row('Nome', esc(d.nome))}
        ${row('Empresa', esc(d.empresa))}
        ${row('Regime', esc(d.regime))}
        ${row('E-mail', `<a href="mailto:${esc(d.email)}" style="color:#0d0d0c;">${esc(d.email)}</a>`)}
        ${row('Telefone', `<a href="tel:+55${esc(d.digits)}" style="color:#0d0d0c;">${esc(d.tel)}</a>`)}
        ${row('Consentimento LGPD', 'Aceito no envio do formulário')}
      </table>
    </td></tr>
    <tr><td style="padding:0 38px 34px;">
      <div style="font:400 11px/1.7 Helvetica,Arial,sans-serif;color:#8a8a83;">
        ${esc(meta.when)}<br>
        Origem: ${esc(meta.origin)}<br>
        IP: ${esc(meta.ip)}
      </div>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  // honeypot: bot preencheu um campo invisível — responde 200 e descarta
  if (String(body.website || '').trim() !== '') return res.status(200).json({ ok: true });

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'desconhecido';
  if (tooMany(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const { errors, data } = validate(body);
  if (errors.length) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY ausente');
    return res.status(500).json({ ok: false, error: 'not_configured' });
  }

  const meta = {
    when: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)',
    origin: req.headers.referer || req.headers.origin || 'direto',
    ip,
  };

  const payload = {
    from: process.env.LEAD_FROM || DEFAULT_FROM,
    to: [process.env.LEAD_TO || DEFAULT_TO],
    reply_to: data.email,
    subject: `Novo lead — ${data.empresa} — Guia PIS/Cofins/CBS`,
    html: template(data, meta),
    text:
      `Novo lead — Guia PIS, Cofins e CBS\n\n` +
      `Nome: ${data.nome}\nEmpresa: ${data.empresa}\nRegime: ${data.regime}\n` +
      `E-mail: ${data.email}\nTelefone: ${data.tel}\n` +
      `Consentimento LGPD: aceito\n\n${meta.when}\nOrigem: ${meta.origin}\nIP: ${meta.ip}\n`,
  };
  if (process.env.LEAD_BCC) payload.bcc = [process.env.LEAD_BCC];

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      console.error('Resend', r.status, await r.text());
      return res.status(502).json({ ok: false, error: 'send_failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Resend exception', err);
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
};
