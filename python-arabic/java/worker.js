// OmniCode — Java worker: compiles Java with javac (TeaVM) and runs it, all inside the browser.
// Runs in a module Web Worker so a runaway program can be stopped by terminating the worker.
import { load } from './compiler.wasm-runtime.js';

let compiler = null;
let initPromise = null;

async function init() {
  const base = new URL('./', import.meta.url).href;
  // noAutoImports: يتخطى WebAssembly.Module.imports() الذي لا يعمل في Safari على الآيفون
  const teavm = await load(base + 'compiler.wasm', { noAutoImports: true });
  const c = teavm.exports.createCompiler();
  const [sdk, rt] = await Promise.all([
    fetch(base + 'compile-classlib-teavm.bin').then(r => r.arrayBuffer()),
    fetch(base + 'runtime-classlib-teavm.bin').then(r => r.arrayBuffer()),
  ]);
  c.setSdk(new Int8Array(sdk));
  c.setTeaVMClasslib(new Int8Array(rt));
  compiler = c;
}

const OUT_LIMIT = 200000;
const EXC_MARK = '@@OMNI_EXC@@';

// System.out / System.err deliver one UTF-16 character at a time
function makeSink(post) {
  let buf = '';
  let total = 0;
  const flush = () => { if (buf) { post(buf); buf = ''; } };
  return {
    put(c) {
      if (total > OUT_LIMIT) return;
      total++;
      buf += String.fromCharCode(c);
      if (c === 10 || buf.length > 2048) flush();
      if (total > OUT_LIMIT) { flush(); post('\n…'); postMessage({ kind: 'outLimit' }); }
    },
    flush,
  };
}

// A small wrapper class: runs the student's main() and reports any Java exception by name
function runnerSource(mainClass) {
  return 'public class OmniRunner {\n' +
    '  public static void main(String[] args) {\n' +
    '    try { ' + mainClass + '.main(args); }\n' +
    '    catch (Throwable t) { System.err.print("' + EXC_MARK + '" + t); }\n' +
    '  }\n' +
    '}\n';
}

// java.util.Scanner is not in TeaVM's class library: we add our own small Scanner class (default
// package) that reads the lines typed by the student. When the input runs out in interactive mode it
// throws OmniNeedInput; the page then asks for one more line and runs the program again.
const NEED_INPUT = '@@OMNI_NEED_INPUT@@';
const SCANNER_JAVA = String.raw`
public class Scanner {
  static String[] LINES = {/*LINES*/};
  static int next = 0;
  static final boolean INTERACTIVE = /*INTERACTIVE*/;
  private String buf = "";
  private int pos = 0;
  public Scanner(java.io.InputStream in) { }
  private boolean pull() {
    if (next < LINES.length) { String l = LINES[next++]; buf = buf.substring(pos) + l + "\n"; pos = 0; if (INTERACTIVE) System.out.println(l); return true; }
    if (INTERACTIVE) throw new OmniNeedInput();
    return false;
  }
  private boolean skipSpaces() {
    while (true) {
      while (pos < buf.length() && Character.isWhitespace(buf.charAt(pos))) pos++;
      if (pos < buf.length()) return true;
      if (!pull()) return false;
    }
  }
  private static InputMismatchException bad(String t) { return new InputMismatchException("For input string: \"" + t + "\""); }
  public String next() {
    if (!skipSpaces()) throw new java.util.NoSuchElementException();
    int s = pos; while (pos < buf.length() && !Character.isWhitespace(buf.charAt(pos))) pos++;
    return buf.substring(s, pos);
  }
  public String nextLine() {
    if (pos >= buf.length() && !pull()) throw new java.util.NoSuchElementException("No line found");
    int e = buf.indexOf('\n', pos); String r = buf.substring(pos, e); pos = e + 1; return r;
  }
  public int nextInt() { String t = next(); try { return Integer.parseInt(t); } catch (NumberFormatException e) { throw bad(t); } }
  public long nextLong() { String t = next(); try { return Long.parseLong(t); } catch (NumberFormatException e) { throw bad(t); } }
  public double nextDouble() { String t = next(); try { return Double.parseDouble(t); } catch (NumberFormatException e) { throw bad(t); } }
  public float nextFloat() { return (float) nextDouble(); }
  public boolean nextBoolean() { String t = next(); if (t.equalsIgnoreCase("true")) return true; if (t.equalsIgnoreCase("false")) return false; throw bad(t); }
  public boolean hasNext() { return skipSpaces(); }
  public boolean hasNextLine() { return pos < buf.length() || pull(); }
  public boolean hasNextInt() { if (!skipSpaces()) return false; int e = pos; while (e < buf.length() && !Character.isWhitespace(buf.charAt(e))) e++; try { Integer.parseInt(buf.substring(pos, e)); return true; } catch (NumberFormatException x) { return false; } }
  public boolean hasNextDouble() { if (!skipSpaces()) return false; int e = pos; while (e < buf.length() && !Character.isWhitespace(buf.charAt(e))) e++; try { Double.parseDouble(buf.substring(pos, e)); return true; } catch (NumberFormatException x) { return false; } }
  public void close() { }
}
class OmniNeedInput extends Error { OmniNeedInput() { super("@@OMNI_NEED_INPUT@@"); } }
class InputMismatchException extends RuntimeException { InputMismatchException() { super(); } InputMismatchException(String m) { super(m); } }
`;
const javaLit = s => '"' + String(s).replace(/[\u0000-\u001f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function scannerSource(lines, interactive) {
  return SCANNER_JAVA.replace('/*LINES*/', (lines || []).map(javaLit).join(', ')).replace('/*INTERACTIVE*/', interactive ? 'true' : 'false');
}
// LocalDate.now() & co. need time-zone data that TeaVM does not have: pass the device's UTC offset
function patchTime(code) {
  const off = -new Date().getTimezoneOffset() * 60;
  return code.replace(/\b(LocalDate|LocalTime|LocalDateTime)\.now\(\s*\)/g, '$1.now(java.time.ZoneOffset.ofTotalSeconds(' + off + '))');
}

async function run(id, code, fileName, mainClass, stdinLines, interactive) {
  code = patchTime(code);
  // our Scanner replaces java.util.Scanner (the import line is blanked, so line numbers stay the same)
  const useScanner = /\bScanner\b/.test(code) && !/\b(class|interface|enum|record)\s+Scanner\b/.test(code);
  if (useScanner) code = code.replace(/^([ \t]*)import\s+java\.util\.(Scanner|InputMismatchException)\s*;/gm, '$1/* $2 */');
  const addScanner = () => { if (useScanner) compiler.addSourceFile('Scanner.java', scannerSource(stdinLines, interactive)); };
  const diags = [];
  const allDiags = [];
  const reg = compiler.onDiagnostic(d => {
    allDiags.push(d.severity + ' ' + (d.fileName || '') + ':' + d.lineNumber + ' ' + String(d.message));
    if (d.severity === 'error') diags.push({ type: d.type, file: d.fileName || '', line: d.lineNumber, col: d.columnNumber != null ? d.columnNumber : -1, message: String(d.message) });
  });
  const t0 = performance.now();
  try {
    compiler.clearSourceFiles();
    compiler.clearOutputFiles();
    compiler.addSourceFile(fileName, code);
    addScanner();
    if (mainClass) compiler.addSourceFile('OmniRunner.java', runnerSource(mainClass));
    let ok = compiler.compile();
    const userDiags = diags.filter(d => !/OmniRunner|Scanner.java/.test(d.file));
    if (userDiags.length) { postMessage({ id, kind: 'compileError', diags: userDiags }); return; }
    let entry = 'OmniRunner';
    if (!ok || diags.length) {
      // wrapper could not be compiled (e.g. main is missing) — compile the student's file alone
      self.__wrapperDiags = diags.slice();
      diags.length = 0;
      compiler.clearSourceFiles(); compiler.clearOutputFiles();
      compiler.addSourceFile(fileName, code);
      addScanner();
      ok = compiler.compile();
      if (!ok || diags.length) { postMessage({ id, kind: 'compileError', diags: diags.slice() }); return; }
      const mains = compiler.detectMainClasses();
      if (!mains || mains.length === 0) { postMessage({ id, kind: 'noMain' }); return; }
      entry = mains[0];
    }
    // asyncEnabled:false → main() runs to completion before returning, so no output is lost
    const gen = await compiler.generateWebAssembly({ outputName: 'app', mainClass: entry, obfuscated: false, asyncEnabled: false });
    if (!gen) { postMessage({ id, kind: 'compileError', diags: diags.slice() }); return; }
    const wasm = compiler.getWebAssemblyOutputFile('app.wasm');
    postMessage({ id, kind: 'compiled', entry, allDiags: allDiags.slice(0, 20), ms: Math.round(performance.now() - t0) });

    const out = makeSink(text => postMessage({ id, kind: 'out', text }));
    const err = makeSink(text => postMessage({ id, kind: 'err', text }));
    const app = await load(wasm, {
      noAutoImports: true,
      installImports(imports) {
        imports.teavmConsole.putcharStdout = c => out.put(c);
        imports.teavmConsole.putcharStderr = c => err.put(c);
      },
    });
    let trap = null;
    try {
      const r = app.exports.main([]);
      if (r && typeof r.then === 'function') await r;
    } catch (e) {
      trap = String((e && e.message) || e);
    }
    out.flush(); err.flush();
    postMessage({ id, kind: 'done', trap, ms: Math.round(performance.now() - t0) });
  } finally {
    reg.destroy();
  }
}

// requests are handled strictly one at a time (the compiler instance is shared)
let queue = Promise.resolve();
onmessage = (e) => { queue = queue.then(() => handle(e)); };

async function handle(e) {
  const { id, type, code, fileName, mainClass, stdinLines, interactive } = e.data;
  try {
    if (!initPromise) initPromise = init();
    await initPromise;
    if (type === 'init') { postMessage({ id, kind: 'ready' }); return; }
    if (type === 'run') await run(id, code, fileName || 'Main.java', mainClass || null, stdinLines, interactive);
  } catch (err) {
    postMessage({ id, kind: 'fatal', message: String((err && err.message) || err) });
  }
};
