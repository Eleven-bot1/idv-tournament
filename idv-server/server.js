const express = require('express');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const MAX_BACKUPS = 30;
const ADMIN_PASSWORD = process.env.ADMIN_PASS || 'admin123';

const DEFAULT_TOURNAMENT = {
  name: '新比赛', date: '', format: 'bo5', status: '报名中',
  teams: [], matches: [], mvp: {}, news: [], forum: []
};
const DEFAULT_DATA = { tournaments: [] };

// ── Cache ──
let _cache = null, _version = 0, _writeTimer = null, _pendingWrite = null;

async function readData() {
  if (_cache) return _cache;
  try { const raw = await fs.promises.readFile(DATA_FILE, 'utf8'); _cache = JSON.parse(raw); }
  catch { _cache = JSON.parse(JSON.stringify(DEFAULT_DATA)); }
  if (!_cache.tournaments) _cache.tournaments = [];
  // Auto-clean old format fields that conflict with multi-tournament format
  if (_cache.tournaments.length > 0) {
    var cleaned = false;
    ['tournament','teams','matches','mvp','news','forum','rules'].forEach(function(k){
      if (_cache.hasOwnProperty(k)){ delete _cache[k]; cleaned = true; }
    });
    if (cleaned) { _version++; scheduleWrite(_cache); }
  }
  return _cache;
}

function scheduleWrite(data) {
  _cache = data; _version++; _pendingWrite = data;
  if (_writeTimer) clearTimeout(_writeTimer);
  _writeTimer = setTimeout(flushWrite, 200);
}

async function flushWrite() {
  const data = _pendingWrite; if (!data) return; _pendingWrite = null;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      await fs.promises.copyFile(DATA_FILE, path.join(BACKUP_DIR, `data.${Date.now()}.json`));
      const files = (await fs.promises.readdir(BACKUP_DIR)).filter(f => f.startsWith('data.')).sort();
      while (files.length > MAX_BACKUPS) await fs.promises.unlink(path.join(BACKUP_DIR, files.shift()));
    }
  } catch {}
  const tmp = DATA_FILE + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(data), 'utf8');
  await fs.promises.rename(tmp, DATA_FILE);
}

// ── Auth ──
function requireAdmin(req, res, next) {
  if ((req.headers['x-admin-pass'] || req.query.pass || '') === ADMIN_PASSWORD) return next();
  res.status(403).json({ ok: false, error: '需要管理员权限' });
}

// ── Helpers ──
function getTournament(data, id) {
  if (!id) return data.tournaments[0] || null;
  return data.tournaments.find(t => t.id === id) || null;
}

// ── App ──
const app = express();
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false, lastModified: false, setHeaders: (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
}}));

app.use((req, _res, next) => { console.log(new Date().toISOString().slice(11, 19) + ' ' + req.method + ' ' + req.url); next(); });

// ── API: Tournament list ──
app.get('/api/tournaments', async (_req, res) => {
  const data = await readData();
  const list = (data.tournaments || []).map(t => ({
    id: t.id, name: t.name, date: t.date, format: t.format,
    status: t.status, teamCount: (t.teams || []).length, matchCount: (t.matches || []).length
  }));
  res.json(list);
});

// ── API: Create tournament (admin) ──
app.post('/api/tournaments', requireAdmin, async (req, res) => {
  try {
    const data = await readData();
    const t = JSON.parse(JSON.stringify(DEFAULT_TOURNAMENT));
    t.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    t.name = req.body.name || '新比赛';
    t.date = req.body.date || '';
    t.format = req.body.format || 'bo5';
    if (!data.tournaments) data.tournaments = [];
    data.tournaments.push(t);
    scheduleWrite(data);
    res.json({ ok: true, tournament: t });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── API: Delete tournament (admin) ──
app.delete('/api/tournaments/:id', requireAdmin, async (req, res) => {
  try {
    const data = await readData();
    data.tournaments = (data.tournaments || []).filter(t => t.id !== req.params.id);
    scheduleWrite(data);
    await flushWrite();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── API: Get tournament data ──
app.get('/api/data', async (req, res) => {
  const data = await readData();
  const t = getTournament(data, req.query.t);
  res.json({ ...(t || data), _v: _version });
});

// ── API: Save tournament data (admin) ──
app.put('/api/data', requireAdmin, async (req, res) => {
  try {
    const data = await readData();
    const tid = req.query.t;
    const body = req.body; delete body._v;
    if (tid) {
      const idx = data.tournaments.findIndex(t => t.id === tid);
      if (idx >= 0) data.tournaments[idx] = body;
      else return res.status(404).json({ ok: false, error: '比赛不存在' });
    }
    scheduleWrite(data);
    res.json({ ok: true, _v: _version });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── API: Register team (public) ──
app.post('/api/register', async (req, res) => {
  try {
    const data = await readData();
    const t = getTournament(data, req.query.t);
    if (!t) return res.status(404).json({ ok: false, error: '比赛不存在' });
    const team = req.body;
    if (!team || !team.name || !team.contact) return res.status(400).json({ ok: false, error: '请填写队伍名和联系方式' });
    if (!team.members || team.members.length < 1) return res.status(400).json({ ok: false, error: '请填写队员' });
    if ((t.teams || []).some(tm => tm.name === team.name)) return res.status(400).json({ ok: false, error: '队伍名已存在' });
    team.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    team.time = new Date().toLocaleString('zh-CN');
    if (!t.teams) t.teams = [];
    t.teams.push(team);
    scheduleWrite(data);
    await flushWrite();
    res.json({ ok: true, team });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── API: Forum post (public) ──
app.post('/api/forum', async (req, res) => {
  try {
    const data = await readData();
    const t = getTournament(data, req.query.t);
    if (!t) return res.status(404).json({ ok: false, error: '比赛不存在' });
    const { nickname, content } = req.body;
    if (!nickname || !content) return res.status(400).json({ ok: false, error: '请填写昵称和内容' });
    if (!t.forum) t.forum = [];
    t.forum.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nickname, content, time: new Date().toLocaleString('zh-CN') });
    scheduleWrite(data);
    await flushWrite();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── API: Delete forum post (admin) ──
app.delete('/api/forum/:id', requireAdmin, async (req, res) => {
  try {
    const data = await readData();
    const t = getTournament(data, req.query.t);
    if (!t) return res.status(404).json({ ok: false, error: '比赛不存在' });
    if (!t.forum) t.forum = [];
    t.forum = t.forum.filter(p => p.id !== req.params.id);
    scheduleWrite(data);
    await flushWrite();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── API: Login ──
app.post('/api/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ ok: true, token: ADMIN_PASSWORD });
  else res.status(401).json({ ok: false, error: '密码错误' });
});

// ── API: Version ──
app.get('/api/version', (_req, res) => { res.json({ _v: _version }); });

// ── API: Health ──
app.get('/api/health', (_req, res) => { res.json({ status: 'ok', v: _version }); });

// ── SPA fallback ──
app.get('*', (_req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// ── Start ──
const PORT = process.env.PORT || 3000;
readData().then(data => {
  _cache = data;
  // Clean old format on startup
  if (_cache.tournaments && _cache.tournaments.length > 0) {
    var c = false;
    ['tournament','teams','matches','mvp','news','forum','rules'].forEach(function(k){
      if (_cache.hasOwnProperty(k)){ delete _cache[k]; c = true; }
    });
    if (c) { _version++; _pendingWrite = _cache; flushWrite(); }
  }
  app.listen(PORT, '0.0.0.0', () => console.log('✅ Server :' + PORT));
});
process.on('SIGTERM', async () => { if (_writeTimer) { clearTimeout(_writeTimer); await flushWrite(); } process.exit(0); });
