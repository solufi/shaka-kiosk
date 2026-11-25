export const dynamic = 'force-dynamic';

const state = globalThis as typeof globalThis & {screenPulse?: number; screenTouch?: number};

function local(request: Request) {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.get('host') || '');
}

export function POST(request: Request) {
  const pulse = request.headers.get('x-shaka-screen');
  const expectedOrigin = 'http://' + request.headers.get('host');
  if (!local(request) || request.headers.get('origin') !== expectedOrigin ||
      (pulse !== 'alive' && pulse !== 'touch')) return new Response(null, {status:403});
  state.screenPulse = Date.now();
  if (pulse === 'touch') state.screenTouch = state.screenPulse;
  return new Response(null, {status:204});
}

export function GET(request: Request) {
  if (!local(request)) return new Response(null, {status:403});
  const age = state.screenPulse === undefined ? null : Date.now() - state.screenPulse;
  return Response.json({
    renderer: age === null ? 'unseen' : age >= 0 && age <= 60000 ? 'responding' : 'stale',
    lastTouch: state.screenTouch ? new Date(state.screenTouch).toISOString() : null,
  }, {headers:{'Cache-Control':'no-store'}});
}
