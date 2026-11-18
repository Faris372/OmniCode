// OmniCode — C++ worker: compiles C++ with clang + wasm-ld (WebAssembly builds) and runs the
// program, all inside the browser. Runs in a Web Worker so a runaway program can be stopped by
// terminating the worker.
// The compiler binaries come from binji's wasm-clang (https://github.com/binji/wasm-clang,
// Apache-2.0, see LICENSE-wasm-clang.txt). This file is our own WASI host adapted from its shared.js.
/* eslint-disable no-restricted-globals */
'use strict';

const BASE = (typeof self !== 'undefined' && self.location) ? new URL('./', self.location.href).href : (globalThis.CPP_BASE || './');
const OUT_LIMIT = 200000;

class ProcExit extends Error { constructor(code) { super('exit(' + code + ')'); this.code = code; } }
class NeedInput extends Error { constructor() { super('need input'); } }

const enc = new TextEncoder();

class Mem {
  constructor(memory) { this.memory = memory; this.refresh(); }
  refresh() { this.buffer = this.memory.buffer; this.u8 = new Uint8Array(this.buffer); this.dv = new DataView(this.buffer); }
  check() { if (this.buffer !== this.memory.buffer || this.buffer.byteLength === 0) this.refresh(); }
  r32(o) { return this.dv.getUint32(o, true); }
  w32(o, v) { this.dv.setUint32(o, v >>> 0, true); }
  w64(o, lo, hi = 0) { this.w32(o, lo); this.w32(o + 4, hi); }
  str(o, len) { let s = ''; const end = len == null ? this.u8.length : o + len; for (let i = o; i < end && this.u8[i]; i++) s += String.fromCharCode(this.u8[i]); return s; }
  write(o, bytes) { new Uint8Array(this.buffer, o, bytes.length).set(bytes); return bytes.length; }
  writeZ(o, s) { const b = enc.encode(s); this.write(o, b); this.u8[o + b.length] = 0; return b.length + 1; }
}

// memfs.wasm: an in-memory file system that also implements the WASI fd_* / path_* calls
class MemFS {
  constructor() {
    this.host = null;        // Mem of the program currently running
    this.onWrite = null;     // (fd, Uint8Array) => void
    this.stdin = new Uint8Array(0); this.stdinPos = 0; this.stdinEOF = true;
  }
  async init(module) {
    const self_ = this;
    const env = {
      abort() { throw new Error('memfs abort'); },
      memfs_log(buf, len) { },
      host_write(fd, iovs, n, out) {
        const h = self_.host; h.check(); let size = 0;
        for (let i = 0; i < n; i++) {
          const p = h.r32(iovs + i * 8), len = h.r32(iovs + i * 8 + 4);
          if (len && self_.onWrite) self_.onWrite(fd, h.u8.slice(p, p + len));
          size += len;
        }
        h.w32(out, size); return 0;
      },
      host_read(fd, iovs, n, out) {
        const h = self_.host; h.check(); let size = 0;
        if (self_.stdinPos >= self_.stdin.length && !self_.stdinEOF) throw new NeedInput();
        // interactive: hand over one line at a time and echo it, like a real terminal
        let avail = self_.stdin.length;
        if (!self_.stdinEOF) { const nl = self_.stdin.indexOf(10, self_.stdinPos); if (nl >= 0) avail = nl + 1; }
        for (let i = 0; i < n; i++) {
          const p = h.r32(iovs + i * 8), len = h.r32(iovs + i * 8 + 4);
          const k = Math.min(len, avail - self_.stdinPos);
          if (k > 0 && !self_.stdinEOF && self_.onWrite) self_.onWrite(1, self_.stdin.slice(self_.stdinPos, self_.stdinPos + k));
          if (k <= 0) break;
          h.u8.set(self_.stdin.subarray(self_.stdinPos, self_.stdinPos + k), p);
          self_.stdinPos += k; size += k;
          if (k < len) break;
        }
        h.w32(out, size); return 0;
      },
      copy_out(dst, src, size) { const h = self_.host; h.check(); self_.mem.check(); h.u8.set(self_.mem.u8.subarray(src, src + size), dst); },
      copy_in(dst, src, size) { const h = self_.host; h.check(); self_.mem.check(); self_.mem.u8.set(h.u8.subarray(src, src + size), dst); },
    };
    this.inst = await WebAssembly.instantiate(module, { env });
    this.x = this.inst.exports;
    this.mem = new Mem(this.x.memory);
    this.x.init();
  }
  setStdin(text, eof) { this.stdin = enc.encode(text); this.stdinPos = 0; this.stdinEOF = eof; }
  addDir(path) { this.mem.check(); this.mem.write(this.x.GetPathBuf(), enc.encode(path)); this.x.AddDirectoryNode(enc.encode(path).length); }
  addFile(path, data) {
    if (typeof data === 'string') data = enc.encode(data);
    const p = enc.encode(path);
    this.mem.check(); this.mem.write(this.x.GetPathBuf(), p);
    const inode = this.x.AddFileNode(p.length, data.length);
    const addr = this.x.GetFileNodeAddress(inode);
    this.mem.check(); this.mem.write(addr, data);
  }
  read(path) {
    const p = enc.encode(path);
    this.mem.check(); this.mem.write(this.x.GetPathBuf(), p);
    const inode = this.x.FindNode(p.length);
    const addr = this.x.GetFileNodeAddress(inode), size = this.x.GetFileNodeSize(inode);
    this.mem.check(); return this.mem.u8.slice(addr, addr + size);
  }
  untar(buf) {
    const u8 = new Uint8Array(buf); let o = 0;
    const s = (off, len) => { let r = ''; for (let i = off; i < off + len && u8[i]; i++) r += String.fromCharCode(u8[i]); return r; };
    while (o + 512 <= u8.length) {
      const name = s(o, 100); if (!name) break;
      const size = parseInt(s(o + 124, 12), 8) || 0; const type = s(o + 156, 1);
      const prefix = s(o + 345, 155);
      const full = prefix ? prefix + '/' + name : name;
      o += 512;
      if (type === '5') this.addDir(full.replace(/\/$/, ''));
      else if (type === '0' || type === '') this.addFile(full, u8.subarray(o, o + size));
      o += Math.ceil(size / 512) * 512;
    }
  }
}

// One WASI process (clang, wasm-ld or the student's program)
function runProcess(module, fs, argv) {
  let mem = null;
  const env = { HOME: '/', PWD: '/' };
  const envList = Object.entries(env).map(([k, v]) => k + '=' + v);
  const sizes = list => list.reduce((s, a) => s + enc.encode(a).length + 1, 0);
  const wasi = {
    proc_exit(code) { throw new ProcExit(code); },
    args_sizes_get(c, s) { mem.check(); mem.w32(c, argv.length); mem.w32(s, sizes(argv)); return 0; },
    args_get(ptrs, buf) { mem.check(); for (const a of argv) { mem.w32(ptrs, buf); ptrs += 4; buf += mem.writeZ(buf, a); } return 0; },
    environ_sizes_get(c, s) { mem.check(); mem.w32(c, envList.length); mem.w32(s, sizes(envList)); return 0; },
    environ_get(ptrs, buf) { mem.check(); for (const a of envList) { mem.w32(ptrs, buf); ptrs += 4; buf += mem.writeZ(buf, a); } return 0; },
    random_get(buf, len) { mem.check(); const d = new Uint8Array(mem.buffer, buf, len); for (let i = 0; i < len; i++) d[i] = (Math.random() * 256) | 0; return 0; },
    clock_time_get(id, precision, out) {
      mem.check();
      const ns = BigInt(Math.round((id === 0 ? Date.now() : performance.now()) * 1e6));
      mem.dv.setBigUint64(out, ns, true); return 0;
    },
    clock_res_get(id, out) { mem.check(); mem.dv.setBigUint64(out, 1000n, true); return 0; },
    poll_oneoff() { return 52; },
    sched_yield() { return 0; },
  };
  Object.assign(wasi, fs.x);
  // (WebAssembly.Module.imports() is avoided: it is broken in Safari on iOS)
  const ns = new Proxy({}, { get: (t, name) => wasi[name] || (() => 52) }); // 52 = ENOSYS
  const imports = { wasi_unstable: ns, wasi_snapshot_preview1: ns };
  const inst = new WebAssembly.Instance(module, imports);
  mem = new Mem(inst.exports.memory);
  fs.host = mem;
  try { inst.exports._start(); return 0; }
  catch (e) { if (e instanceof ProcExit) return e.code; throw e; }
}

let fs = null, clang = null, lld = null, initP = null;
let last = { code: null, module: null };

async function fetchBuf(name) {
  if (globalThis.CPP_FETCH) return globalThis.CPP_FETCH(name);
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + name);
  return r.arrayBuffer();
}
async function compileMod(name) { return WebAssembly.compile(await fetchBuf(name)); }

async function init() {
  const [memfsMod, tar, c, l] = await Promise.all([compileMod('memfs.wasm'), fetchBuf('sysroot.tar'), compileMod('clang.wasm'), compileMod('lld.wasm')]);
  fs = new MemFS();
  await fs.init(memfsMod);
  fs.untar(tar);
  clang = c; lld = l;
}

const CLANG_ARGS = ['clang', '-cc1', '-emit-obj', '-disable-free', '-isysroot', '/',
  '-internal-isystem', '/include/c++/v1', '-internal-isystem', '/include', '-internal-isystem', '/lib/clang/8.0.1/include',
  '-std=c++17', '-ferror-limit', '8', '-fmessage-length', '0', '-fno-color-diagnostics',
  '-Wall', '-Wno-unused-variable',
  '-o', 'main.o', '-x', 'c++', 'main.cpp'];
const LLD_ARGS = ['wasm-ld', '--no-threads', '-z', 'stack-size=1048576', '-Llib/wasm32-wasi', 'lib/wasm32-wasi/crt1.o', 'main.o',
  '-lc', '-lc++', '-lc++abi', 'lib/clang/8.0.1/lib/wasi/libclang_rt.builtins-wasm32.a', '-o', 'main.wasm'];

function collect(fd) {
  const dec = new TextDecoder();
  let s = '';
  return { push(b) { s += dec.decode(b, { stream: true }); }, get() { return s + dec.decode(); } };
}

async function build(id, code) {
  if (last.code === code && last.module) return { module: last.module };
  const t0 = Date.now();
  const log = collect();
  fs.onWrite = (fd, b) => log.push(b);
  fs.setStdin('', true);
  fs.addFile('main.cpp', code);
  let rc;
  try { rc = runProcess(clang, fs, CLANG_ARGS); }
  catch (e) { return { fatal: 'clang: ' + ((e && e.message) || e) }; }
  const diag = log.get();
  if (rc !== 0) return { compileError: diag || 'compile failed' };
  const log2 = collect();
  fs.onWrite = (fd, b) => log2.push(b);
  try { rc = runProcess(lld, fs, LLD_ARGS); }
  catch (e) { return { fatal: 'wasm-ld: ' + ((e && e.message) || e) }; }
  if (rc !== 0) return { linkError: log2.get() || 'link failed', warnings: diag };
  const module = await WebAssembly.compile(fs.read('main.wasm'));
  last = { code, module };
  return { module, warnings: diag, ms: Date.now() - t0 };
}

async function run(id, code, stdin, interactive) {
  const b = await build(id, code);
  if (b.fatal) { postMessage({ id, kind: 'fatal', message: b.fatal }); return; }
  if (b.compileError) { postMessage({ id, kind: 'compileError', text: b.compileError }); return; }
  if (b.linkError) { postMessage({ id, kind: 'linkError', text: b.linkError }); return; }
  postMessage({ id, kind: 'compiled', warnings: b.warnings || '', ms: b.ms || 0 });
  const dec = [new TextDecoder(), new TextDecoder()];
  let total = 0, buf = ['', ''], cut = false;
  const flush = () => { for (const fd of [1, 2]) if (buf[fd - 1]) { postMessage({ id, kind: fd === 1 ? 'out' : 'err', text: buf[fd - 1] }); buf[fd - 1] = ''; } };
  fs.onWrite = (fd, bytes) => {
    if (cut) return;
    const k = fd === 2 ? 1 : 0;
    total += bytes.length;
    buf[k] += dec[k].decode(bytes, { stream: true });
    if (buf[k].length > 4096) flush();
    if (total > OUT_LIMIT) { cut = true; buf[k] += '\n…'; flush(); postMessage({ id, kind: 'outLimit' }); }
  };
  fs.setStdin(stdin || '', !interactive);
  let exit = 0, trap = null, needInput = false;
  try { exit = runProcess(b.module, fs, ['main']); }
  catch (e) {
    if (e instanceof NeedInput) needInput = true;
    else trap = String((e && e.message) || e) + (e instanceof RangeError ? ' [RangeError]' : '');
  }
  buf[0] += dec[0].decode(); buf[1] += dec[1].decode();
  flush();
  postMessage({ id, kind: 'done', exit, trap, needInput });
}

let queue = Promise.resolve();
self.onmessage = e => { queue = queue.then(() => handle(e.data)); };
async function handle(d) {
  const { id, type } = d;
  try {
    if (!initP) initP = init();
    await initP;
    if (type === 'init') { postMessage({ id, kind: 'ready' }); return; }
    if (type === 'run') await run(id, d.code, d.stdin, d.interactive);
  } catch (err) {
    postMessage({ id, kind: 'fatal', message: String((err && err.message) || err) });
  }
}
