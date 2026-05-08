export async function onRequest({ request, next, env }) {
  const path = new URL(request.url).pathname;

  const adminPaths       = ['/admin.html', '/admin'];
  const distributorPaths = ['/charting.html', '/charting', '/tracker.html', '/tracker'];

  if (adminPaths.some(p => path === p)) {
    const deny = checkAuth(request, env.ADMIN_PASSWORD, 'MYIP411 Admin');
    if (deny) return deny;
  }

  if (distributorPaths.some(p => path === p)) {
    const deny = checkAuth(request, env.CHARTING_PASSWORD, 'MYIP411 Distributor');
    if (deny) return deny;
  }

  return next();
}

function checkAuth(request, password, realm) {
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Basic ')) return deny(realm);
  try {
    const decoded = atob(auth.slice(6));
    const pass = decoded.slice(decoded.indexOf(':') + 1);
    if (pass === password) return null; // authorized
  } catch {}
  return deny(realm);
}

function deny(realm) {
  return new Response('Access restricted.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"`,
      'Content-Type': 'text/plain',
    },
  });
}
