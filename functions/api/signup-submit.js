const EMPTY_STATE = () => ({
  charted_count: 0, delivered_count: 0, business_count: 0, signup_count: 0,
  phase1_complete: false, phase2_complete: false,
  addresses: [], businesses: [],
});

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();

    if (!data.name?.trim() || !data.email?.trim() || !data.streetAddress?.trim()) {
      return json({ success: false, error: 'Name, email, and street address are required.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return json({ success: false, error: 'Invalid email address.' }, 400);
    }

    const today = new Date().toISOString().split('T')[0];
    const name  = data.name.trim();
    const email = data.email.trim().toLowerCase();

    // ── Notion write ──────────────────────────────────────────────────────────
    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type':   'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: env.NOTION_SIGNUP_DB },
        properties: {
          'Name':                   { title:     [{ text: { content: name } }] },
          'Email':                  { email },
          'Street Address':         { rich_text: [{ text: { content: data.streetAddress.trim() } }] },
          'Date Signed Up':         { date: { start: today } },
          'Confirmation Sent':      { checkbox: false },
          'Flier Cross-Referenced': { checkbox: false },
        },
      }),
    });

    if (!notionRes.ok) {
      console.error('Notion error:', await notionRes.text());
      return json({ success: false, error: 'Failed to log signup.' }, 502);
    }

    const notionData = await notionRes.json();
    const pageId     = notionData.id;

    // ── Resend confirmation ───────────────────────────────────────────────────
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'MYIP411 <noreply@myip411.org>',
        to:      [email],
        subject: "You're on the list — MYIP411",
        html:    confirmationEmailHtml(name),
      }),
    });

    if (emailRes.ok && pageId) {
      await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization':  `Bearer ${env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type':   'application/json',
        },
        body: JSON.stringify({
          properties: { 'Confirmation Sent': { checkbox: true } },
        }),
      });
    }

    // ── KV increment — only if signup came from the flier QR code ────────────
    if (data.source === 'flier') {
      const raw   = await env.KV.get('state');
      const state = raw ? JSON.parse(raw) : EMPTY_STATE();
      state.signup_count = (state.signup_count || 0) + 1;
      await env.KV.put('state', JSON.stringify(state));
    }

    return json({ success: true });
  } catch (err) {
    console.error('signup-submit error:', err);
    return json({ success: false, error: 'Server error.' }, 500);
  }
}

function confirmationEmailHtml(name) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:0 auto;padding:32px 24px;color:#111">
  <h2 style="margin:0 0 24px;font-size:22px">You're on the MYIP411 list.</h2>
  <p style="margin:0 0 16px;line-height:1.6">Hi ${name},</p>
  <p style="margin:0 0 16px;line-height:1.6">You're signed up. We'll use this list to share updates, tools, and community resources about internet service quality in your area.</p>
  <p style="margin:0 0 16px;line-height:1.6">No spam. No selling your data. This is a community resource — that's all it is.</p>
  <p style="margin:0 0 32px;line-height:1.6">Questions? <a href="mailto:spencer@myip411.org" style="color:#2563eb">spencer@myip411.org</a></p>
  <p style="margin:0;line-height:1.6">— Spencer Dorsey<br><a href="https://myip411.org" style="color:#2563eb">myip411.org</a></p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="margin:0;font-size:12px;color:#9ca3af">You signed up at myip411.org. If this wasn't you, ignore this email.</p>
</body>
</html>`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
