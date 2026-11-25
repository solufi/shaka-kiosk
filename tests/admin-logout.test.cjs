const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loader } = require('./loader.cjs');

async function kiosk(t, { authenticated = true, failFirstLogout = false } = {}) {
  const window = new EventTarget();
  const redirects = [];
  window.location = { hostname: 'test', replace: url => redirects.push(url) };
  const values = new Map([['shaka:isAdmin', '1'], ['shaka:test-mode', '1']]);
  window.localStorage = window.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  let deletes = 0;
  const fetch = async (url, init) => {
    assert.equal(url, '/api/admin/session');
    if (init.method === 'DELETE') {
      deletes++;
      if (failFirstLogout && deletes === 1) throw Error('local server unavailable');
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ authenticated }) };
  };
  const container = ({ children }) => React.createElement('div', {}, children);
  const button = props => React.createElement('button', props);
  const side = Object.fromEntries(['SidebarProvider','Sidebar','SidebarHeader','SidebarContent',
    'SidebarMenu','SidebarMenuItem','SidebarInset','SidebarFooter'].map(key => [key, container]));
  const runtime = loader(path.resolve(__dirname, '..'), {}, {
    'next/navigation': { usePathname: () => '/dashboard' },
    'next/link': container,
    'lucide-react': { LayoutGrid: () => null, BarChart2: () => null, LogOut: () => null },
    '@/components/test-mode': { TestModeProvider: container, TestModeButton: () => null },
    '@/components/ui/sidebar': { ...side, SidebarTrigger: button, SidebarMenuButton: button },
    '@/components/ui/button': { Button: button }, '@/components/logo': { Logo: () => null },
    '@/components/keypad-login-dialog': { KeypadLoginDialog: () => null },
    '@/lib/corporate-queue': { flushRedemptions: async () => {} },
    '@/hooks/use-toast': { useToast: () => ({ toast() {} }) },
  }, { window, Event, fetch });
  const Layout = runtime.load('src/app/(app)/layout.tsx').default;
  let tree;
  await act(async () => { tree = create(React.createElement(Layout, {}, React.createElement('article'))); });
  t.after(() => act(() => tree.unmount()));
  return { tree, values, redirects, deletes: () => deletes };
}

test('logging out on the dashboard closes admin tools and replaces the page with the store', async t => {
  const { tree, values, redirects, deletes } = await kiosk(t);
  assert.equal(tree.root.findAllByType('article').length, 1);
  await act(async () => tree.root.findByProps({ tooltip: 'Se déconnecter' }).props.onClick());
  assert.deepEqual(redirects, ['/']);
  assert.equal(deletes(), 1);
  assert.equal(tree.root.findAllByType('article').length, 0);
  assert.equal(values.has('shaka:isAdmin'), false);
  assert.equal(values.has('shaka:test-mode'), false);
  assert.ok(values.get('shaka:lastAdminLogout'));
});

test('a failed logout hides the dashboard and can retry before returning to customers', async t => {
  const { tree, redirects, deletes } = await kiosk(t, { failFirstLogout: true });
  await act(async () => tree.root.findByProps({ tooltip: 'Se déconnecter' }).props.onClick());
  assert.deepEqual(redirects, []);
  assert.equal(tree.root.findAllByType('article').length, 0);
  await act(async () => tree.root.findByType('button').props.onClick());
  assert.equal(deletes(), 2);
  assert.deepEqual(redirects, ['/']);
});

test('a stale admin marker cannot restore the dashboard after logout or expiry', async t => {
  const { tree, values, redirects } = await kiosk(t, { authenticated: false });
  assert.equal(tree.root.findAllByType('article').length, 0);
  assert.equal(values.has('shaka:isAdmin'), false);
  assert.deepEqual(redirects, ['/']);
});
