const test = require('node:test');
const assert = require('node:assert/strict');
const {loader} = require('./loader.cjs');

test('an idle renderer remains healthy without touches and an expired pulse signals a stall', async () => {
  let now = 100000;
  class Clock extends Date { static now() { return now; } }
  const route = loader(process.cwd(), {}, {}, {Response, Date:Clock}).load('src/app/api/screen-health/route.ts');
  const send = (pulse, origin='http://127.0.0.1:3000') => new Request(origin, {headers:{
    host:'127.0.0.1:3000', origin, 'x-shaka-screen':pulse,
  }});
  const status = () => route.GET(send('alive')).json();
  assert.equal((await status()).renderer, 'unseen');
  assert.equal(route.POST(send('touch', 'http://example.invalid')).status, 403);
  assert.equal(route.POST(send('alive')).status, 204);
  assert.deepEqual(await status(), {renderer:'responding', lastTouch:null});
  now += 61000;
  assert.equal((await status()).renderer, 'stale');
  route.POST(send('touch'));
  assert.deepEqual(await status(), {renderer:'responding', lastTouch:new Date(now).toISOString()});
});
