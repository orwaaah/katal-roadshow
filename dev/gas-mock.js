// Minimal in-memory mock of the Google Apps Script services used by apps-script/Code.gs.
// Used only for local testing (node dev/server.js). Not part of the live app.
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function chain(target) {
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'then') return undefined;
      return () => chain(t); // unknown formatting method → no-op, chainable
    }
  });
}

function parseLikeSheets(v, fmt) {
  // Emulate Sheets auto-parsing of strings when the cell is not plain-text formatted.
  if (typeof v !== 'string' || fmt === '@') return v;
  const s = v.trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith('=')) return '#FORMULA:' + s;
  return v;
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; this.fmt = {}; this.maxRows = 1000; }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) if ((this.data[r] || []).some(v => v !== '' && v != null)) return r + 1;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.data.forEach(row => { for (let c = (row || []).length - 1; c >= 0; c--) if (row[c] !== '' && row[c] != null) { m = Math.max(m, c + 1); break; } });
    return m;
  }
  getMaxRows() { return this.maxRows; }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(r, c, nr = 1, nc = 1) { return chain(new Range(this, r, c, nr, nc)); }
  insertColumnBefore(col) {
    this.data.forEach(row => { if (row && row.length >= col - 1) row.splice(col - 1, 0, ''); });
    const nf = {};
    Object.keys(this.fmt).forEach(k => { const [r, c] = k.split(',').map(Number); nf[r + ',' + (c >= col ? c + 1 : c)] = this.fmt[k]; });
    this.fmt = nf;
  }
  setFrozenRows() {}
  setColumnWidth() {}
  cell(r, c) { return ((this.data[r - 1] || [])[c - 1]); }
  set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = parseLikeSheets(v, this.fmt[r + ',' + c]);
  }
}

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const v = this.sh.cell(this.r + i, this.c + j); row.push(v == null ? '' : v); }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(v) {
    if (v.length !== this.nr || v[0].length !== this.nc) throw new Error(`setValues size mismatch: got ${v.length}x${v[0].length}, range ${this.nr}x${this.nc}`);
    v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x)));
    return this;
  }
  setValue(x) { this.sh.set(this.r, this.c, x); return this; }
  setNumberFormat(f) {
    const n = Math.min(this.nr, 1200);
    for (let i = 0; i < n; i++) for (let j = 0; j < this.nc; j++) this.sh.fmt[(this.r + i) + ',' + (this.c + j)] = f;
    return this;
  }
  setNumberFormats(f) { f.forEach((row, i) => row.forEach((x, j) => { this.sh.fmt[(this.r + i) + ',' + (this.c + j)] = x; })); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.sh.cell(this.r + i, this.c + j) !== undefined) this.sh.data[this.r + i - 1][this.c + j - 1] = ''; return this; }
}

class Spreadsheet {
  constructor() { this.sheets = [new Sheet('Sheet1')]; this.id = 'mock-sheet-id'; }
  getId() { return this.id; }
  getName() { return 'Mock Sheet'; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  setSpreadsheetTimeZone() {}
  setActiveSheet(s) { this.active = s; return s; }
  moveActiveSheet(i) { this.sheets = this.sheets.filter(x => x !== this.active); this.sheets.splice(i - 1, 0, this.active); }
  toast() {}
}

function makeContext(state) {
  const ss = state.ss || (state.ss = new Spreadsheet());
  const props = state.props || (state.props = {});
  const cache = state.cache || (state.cache = {});
  const pad = n => String(n).padStart(2, '0');
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      newDataValidation: () => chain({ build: () => ({}) }),
      getUi: () => { throw new Error('no ui'); },
      flush() {}
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map(b => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: bytes => Buffer.from(typeof bytes === 'string' ? bytes : bytes.map(b => (b + 256) % 256)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => {
        const x = new Date(d.getTime() + 4 * 3600 * 1000); // Asia/Dubai = UTC+4
        const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return f.replace('yyyy', x.getUTCFullYear()).replace('MMM', M[x.getUTCMonth()]).replace('MM', pad(x.getUTCMonth() + 1))
          .replace('dd', pad(x.getUTCDate())).replace('HH', pad(x.getUTCHours())).replace('mm', pad(x.getUTCMinutes()));
      }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s })
    },
    Logger: { log: (...a) => state.quiet || console.log('[Logger]', ...a) }
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'Code.gs' });
  return ctx;
}

module.exports = { makeContext, Spreadsheet };
