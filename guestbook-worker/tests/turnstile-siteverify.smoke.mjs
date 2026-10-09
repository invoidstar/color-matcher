import assert from 'node:assert/strict';
import { test } from 'node:test';

// Cloudflare's published dummy Siteverify fixtures. No production keys,
// visitor tokens, Cloudflare account credentials or D1 operations are used.
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
async function verify(secret) {
  const response = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ secret, response: TOKEN }),
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(response.status, 200);
  return response.json();
}
test('official Siteverify dummy success and forced failure', async () => {
  const passed = await verify('1x0000000000000000000000000000000AA');
  assert.equal(passed.success, true, 'the published always-pass test secret must validate the dummy token');
  assert.equal(typeof passed.hostname, 'string');
  console.log('PASS Turnstile official always-pass test key: success=true; test hostname=', passed.hostname, '; action=', passed.action ?? '(unset)', '; cdata=', passed.cdata ?? '(unset)');

  const rejected = await verify('2x0000000000000000000000000000000AA');
  assert.equal(rejected.success, false, 'the published always-fail test secret must reject the dummy token');
  console.log('PASS Turnstile official always-fail test key: success=false');
});
