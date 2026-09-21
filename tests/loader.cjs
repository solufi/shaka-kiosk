const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const ts = require('typescript');
class Response {
  constructor(body, opts = {}) { this.body = body; this.status = opts.status || 200; this.headers = new Headers(opts.headers); }
  static json(body, opts) { return new Response(body, opts); }
}
function loader(root, env, stubs = {}, globals = {}) {
  const cache = new Map();
  const ctx = vm.createContext({ console, process: { env, pid: process.pid, cwd: () => root }, Buffer, crypto, URL, Headers, Uint8Array, TextEncoder, AbortController, Date, setTimeout, clearTimeout, ...globals });
  function load(file) {
    file = path.resolve(file); if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    function req(name) {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name === 'next/server') return { NextResponse: Response };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
      if (name.startsWith('@/')) return load(path.join(root, 'src', name.slice(2)));
      return require(name);
    }
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInContext('(function(require,module,exports){' + code + '\n})', ctx, { filename: file })(req, module, module.exports);
    return module.exports;
  }
  return { load: file => load(path.join(root, file)), ctx };
}
module.exports = { loader, Response };
