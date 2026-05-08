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
  // Verify admin password via header
  const key = request.headers.get('X-Admin-Key') ?? '';
  if (key !== env.ADMIN_PASSWORD) {
    return json({ success: false, error: 'Unauthorized.' }, 401);
  }

  try {
    const { action, confirm } = await request.json();
    const raw   = await env.KV.get('state');
    const state = raw ? JSON.parse(raw) : EMPTY_STATE();

    switch (action) {
      case 'mark_phase1_complete':
        state.phase1_complete = true;
        break;

      case 'mark_phase2_complete':
        state.phase2_complete = true;
        break;

      case 'unmark_phase1_complete':
        state.phase1_complete = false;
        break;

      case 'unmark_phase2_complete':
        state.phase2_complete = false;
        break;

      case 'reset':
        if (confirm !== 'RESET') {
          return json({ success: false, error: 'Send { confirm: "RESET" } to proceed.' }, 400);
        }
        Object.assign(state, EMPTY_STATE());
        break;

      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }

    await env.KV.put('state', JSON.stringify(state));
    return json({ success: true, earnings: calculateEarnings(state) });

  } catch (err) {
    console.error('admin-action error:', err);
    return json({ success: false, error: 'Server error.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
