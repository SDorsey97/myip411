function calculateEarnings(state) {
  const charted    = state.charted_count   || 0;
  const delivered  = state.delivered_count || 0;
  const businesses = state.business_count  || 0;
  const signups    = state.signup_count    || 0;

  let phase1 = 0;
  phase1 += Math.min(charted, 25) * 0.40;
  if (charted > 25) phase1 += Math.min(charted - 25, 25) * 0.65;
  if (charted > 50) phase1 += Math.min(charted - 50, 25) * 0.90;
  if (charted >= 25) phase1 += 5;
  if (charted >= 50) phase1 += 8;
  if (charted >= 75) phase1 += 12;
  const phase1Earned = r2(phase1);
  phase1 = Math.min(phase1, 75);

  let phase2 = 0;
  phase2 += delivered  * 0.50;
  phase2 += businesses * 5.00;
  phase2 += signups    * 1.00;
  if (delivered >= 25) phase2 += 5;
  if (delivered >= 50) phase2 += 10;
  if (state.phase2_complete) phase2 += 10;
  const phase2Earned = r2(phase2);
  phase2 = Math.min(phase2, 85);

  const completionBonus = (state.phase1_complete && state.phase2_complete) ? 20 : 0;

  return {
    phase1, phase2, completionBonus,
    total: r2(phase1 + phase2 + completionBonus),
    charted, delivered, businesses, signups,
    phase1Earned, phase2Earned,
    phase1Capped:   phase1Earned >= 75,
    phase2Capped:   phase2Earned >= 85,
    phase1Complete: !!state.phase1_complete,
    phase2Complete: !!state.phase2_complete,
    m_charted_25:   charted >= 25,
    m_charted_50:   charted >= 50,
    m_charted_75:   charted >= 75,
    m_delivered_25: delivered >= 25,
    m_delivered_50: delivered >= 50,
  };
}
function r2(n) { return Math.round(n * 100) / 100; }

const EMPTY_STATE = () => ({
  charted_count: 0, delivered_count: 0, business_count: 0, signup_count: 0,
  phase1_complete: false, phase2_complete: false,
  addresses: [], businesses: [],
});

export async function onRequestPost({ request, env }) {
  try {
    const data  = await request.json();
    const raw   = await env.KV.get('state');
    const state = raw ? JSON.parse(raw) : EMPTY_STATE();
    const today = new Date().toISOString().split('T')[0];

    if (data.type === 'business') {
      // ── Log a business placement ─────────────────────────────────────────
      if (!data.businessName?.trim()) {
        return json({ success: false, error: 'Business name is required.' }, 400);
      }

      state.businesses = state.businesses || [];
      state.businesses.push({
        name:       data.businessName.trim(),
        address:    (data.businessAddress ?? '').trim(),
        dateLogged: today,
      });
      state.business_count = state.businesses.length;

    } else {
      // ── Mark a charted address as delivered ──────────────────────────────
      if (!data.addressId) {
        return json({ success: false, error: 'Address ID required.' }, 400);
      }

      const addr = (state.addresses || []).find(a => a.id === data.addressId);
      if (!addr)           return json({ success: false, error: 'Address not found.' }, 404);
      if (addr.delivered)  return json({ success: false, error: 'Already marked delivered.' }, 409);

      addr.delivered     = true;
      addr.dateDelivered = today;
      state.delivered_count = state.addresses.filter(a => a.delivered).length;

      // Sync Flier Delivered checkbox back to Notion
      await fetch(`https://api.notion.com/v1/pages/${addr.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization':  `Bearer ${env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type':   'application/json',
        },
        body: JSON.stringify({
          properties: { 'Flier Delivered': { checkbox: true } },
        }),
      });
    }

    await env.KV.put('state', JSON.stringify(state));
    return json({ success: true, earnings: calculateEarnings(state) });

  } catch (err) {
    console.error('delivery-submit error:', err);
    return json({ success: false, error: 'Server error.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
