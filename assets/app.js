/* Idiomas — motor compartido de las páginas de idioma.
 * Lee window.LANG_DATA (data/<código>.js) y construye toda la página.
 * El progreso se guarda en localStorage con las mismas claves que la versión anterior,
 * así nadie pierde lo que ya había avanzado. */
(function(){
'use strict';

const L = window.LANG_DATA;
const MASTERY = 3;                       // aciertos para dominar una frase
const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64]; // días entre repasos según la «caja» de la tarjeta
const REVIEW_CAP = 20;                   // tarjetas por sesión de repaso
const P = L.storagePrefix;
const K = {
  progress: P + '-progress-v1', streak: P + '-streak', srs: P + '-srs', fav: P + '-fav',
  log: P + '-log', voice: P + '-progress-v1-voice', phase: P + '-lastphase',
};

/* ---------------- Utilidades ---------------- */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  raw(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  setRaw(k, v){ try{ localStorage.setItem(k, v); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} },
};
function dstr(d){ d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function addDays(s, n){ const [y,m,d] = s.split('-').map(Number); return dstr(new Date(y, m-1, d+n)); }
const today = () => dstr();
function shuffle(a){ a = a.slice(); for(let i = a.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }

/* ---------------- Índice de contenido ---------------- */
const PHASES = L.phases;
const ALL = [];      // todas las frases
const BY_ID = {};
const TASKS = [];
PHASES.forEach((ph, pi) => {
  const legacyFlat = /^\d+$/.test(ph.key) && ph.items;  // fases originales sin grupos: a-<fase>-<n>
  ph._ids = [];
  const push = (it, id, label) => {
    const o = Object.assign({id, pi, label}, it);
    ALL.push(o); BY_ID[id] = o; ph._ids.push(id);
  };
  if (legacyFlat) ph.items.forEach((it, ai) => push(it, `a-${ph.key}-${ai}`, null));
  else (ph.groups || [{label:null, items: ph.items}]).forEach((g, gi) => g.items.forEach((it, ai) => push(it, `a-${ph.key}-${gi}-${ai}`, g.label)));
  (ph.tasks || []).forEach((t, ti) => TASKS.push(`t-${ph.key}-${ti}`));
});

/* ---------------- Estado ---------------- */
let prog = store.get(K.progress, {}) || {};
let streak = store.get(K.streak, null) || {count: 0, lastDate: null};
let log = store.get(K.log, {}) || {};
let fav = new Set(store.get(K.fav, []) || []);
let srs = store.get(K.srs, null);
const settings = Object.assign({rate: 0.85, roman: true, hideEs: false, goal: 20, strict: 'flex'}, store.get('idiomas-settings', {}) || {});
if (!srs){
  // Primera vez con la versión nueva: las frases ya practicadas entran al repaso, repartidas en varios días.
  srs = {}; let i = 0;
  ALL.forEach(it => { const c = prog[it.id] || 0; if (c > 0){ srs[it.id] = {box: Math.min(c, 3), due: addDays(today(), i++ % 6)}; } });
  store.set(K.srs, srs);
}
store.setRaw('idiomas-last', L.code);
const save = {
  prog(){ store.set(K.progress, prog); }, srs(){ store.set(K.srs, srs); }, fav(){ store.set(K.fav, Array.from(fav)); },
  log(){ store.set(K.log, log); }, streak(){ store.set(K.streak, streak); }, settings(){ store.set('idiomas-settings', settings); },
};
const masteredCount = () => ALL.filter(it => (prog[it.id] || 0) >= MASTERY).length;
const dueIds = () => Object.keys(srs).filter(id => BY_ID[id] && srs[id].due <= today())
  .sort((a, b) => srs[a].due < srs[b].due ? -1 : srs[a].due > srs[b].due ? 1 : srs[a].box - srs[b].box);
const xpToday = () => log[today()] || 0;

function streakNow(){
  const t = today(), y = addDays(t, -1);
  if (!streak.lastDate) return 0;
  return (streak.lastDate >= y) ? streak.count : 0;  // >= cubre también fechas guardadas en UTC por la versión anterior
}
function bumpStreak(){
  const t = today(), y = addDays(t, -1);
  if (streak.lastDate && streak.lastDate >= t){ streak.lastDate = t; }
  else if (streak.lastDate === y){ streak.count += 1; streak.lastDate = t; }
  else { streak.count = 1; streak.lastDate = t; }
  streak.best = Math.max(streak.best || 0, streak.count);
  save.streak();
}
function addXP(n){
  const before = xpToday();
  log[today()] = before + n; save.log();
  bumpStreak();
  if (before < settings.goal && before + n >= settings.goal){ toast('🎯 ¡Meta diaria cumplida! Racha: ' + plural(streakNow(), 'día', 'días')); chime(); }
  renderHeader();
}
function ensureSrs(id){ if (!srs[id]){ srs[id] = {box: 0, due: addDays(today(), 1)}; save.srs(); } }
function bumpMastery(id){
  const before = prog[id] || 0;
  prog[id] = Math.min(before + 1, MASTERY); save.prog();
  ensureSrs(id);
  updateCard(id);
  if (before < MASTERY && prog[id] >= MASTERY){ celebrate(id); addXP(5); }
  renderProgress(); renderNav();
}
function markWeak(id){ srs[id] = Object.assign(srs[id] || {}, {box: 0, due: today()}); save.srs(); }

/* ---------------- Voz (síntesis) ---------------- */
let voices = [];
let currentAudio = null;
let playingBtn = null;
const lastSpeak = {};
function loadVoices(){
  return new Promise(res => {
    if (!('speechSynthesis' in window)) return res([]);
    const v = speechSynthesis.getVoices();
    if (v.length) return res(v);
    let done = false;
    const fin = () => { if (!done){ done = true; res(speechSynthesis.getVoices()); } };
    speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', fin, {once: true});
    setTimeout(fin, 1500);
  });
}
async function ensureVoices(){ if (!voices.length) voices = await loadVoices(); return voices; }
const pre = L.voice.slice(0, 2).toLowerCase();
const langVoices = () => voices.filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(pre));
function chosenVoice(){
  const saved = store.raw(K.voice);
  if (saved){ const v = voices.find(x => x.name === saved); if (v) return v; }
  const lv = langVoices();
  return lv.find(v => v.lang.replace('_', '-') === L.voice) || lv[0] || null;
}
const ttsText = t => String(t).replace(/\s*\/\s*/g, ', ').replace(/\.\.\.|…/g, '…');
function setPlaying(btn){ if (playingBtn) playingBtn.classList.remove('playing'); playingBtn = btn || null; if (btn) btn.classList.add('playing'); }
function stopAudio(){
  try{ if ('speechSynthesis' in window) speechSynthesis.cancel(); }catch(e){}
  if (currentAudio){ try{ currentAudio.pause(); }catch(e){} currentAudio = null; }
}
async function speak(text, opts){
  opts = opts || {};
  const now = Date.now();
  if (lastSpeak[text] && now - lastSpeak[text] < 600) return;   // evita doble disparo táctil en móviles
  lastSpeak[text] = now;
  stopAudio(); setPlaying(opts.btn);
  const rate = opts.rate || settings.rate;
  await ensureVoices();
  const v = chosenVoice();
  const end = () => { if (playingBtn === opts.btn) setPlaying(null); };
  if (v){
    const u = new SpeechSynthesisUtterance(ttsText(text));
    u.voice = v; u.lang = v.lang || L.voice; u.rate = rate; u.volume = 1;
    u.onend = end; u.onerror = end;
    try{ speechSynthesis.resume(); }catch(e){}
    setTimeout(() => speechSynthesis.speak(u), 50);
    return;
  }
  // Sin voz instalada: servicio de audio en línea.
  const a = new Audio('https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=' + L.voice + '&q=' + encodeURIComponent(ttsText(text)));
  a.playbackRate = Math.min(1.3, Math.max(0.6, rate / 0.85));
  currentAudio = a; a.onended = end;
  let failed = false;
  const fail = () => { end(); if (failed) return; failed = true; toast('No hay voz en ' + L.langEs + ' en este dispositivo y el audio en línea no respondió. Mira ⚙️ Ajustes → Voz.'); };
  a.onerror = fail;
  a.play().catch(fail);
}

/* ---------------- Reconocimiento de voz ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function norm(s){
  s = String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\.\.\.|…/g, ' ');
  if (L.latin) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  if (L.code === 'ru') s = s.replace(/ё/g, 'е');
  return s.replace(/[^\p{L}\p{N}]+/gu, '');
}
function normRoman(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ''); }
function lev(a, b){
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({length: n+1}, (_, j) => j);
  for (let i = 1; i <= m; i++){
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], cur[j-1], prev[j-1]);
    prev = cur;
  }
  return prev[n];
}
const sameAsRoman = it => normRoman(it.es) === normRoman(it.r);
const variants = t => String(t).split(/\s*\/\s*/).map(norm).filter(Boolean);
function closeEnough(said, expected, ratio){
  const s = norm(said); if (!s) return false;
  return variants(expected).some(e => {
    if (s === e) return true;
    if (e.length >= 4 && s.includes(e)) return true;
    return lev(s, e) <= Math.max(1, Math.ceil(e.length * (ratio || 0.25)));
  });
}
/* ---------- Evaluación de la pronunciación ----------
 * Compara palabra por palabra (o carácter por carácter en chino, japonés y coreano) con tolerancia:
 * tildes, mayúsculas y signos no cuentan; números en cifra = número en palabra; hiragana = katakana;
 * en chino se compara el sonido (pinyin), porque el reconocedor a menudo escribe otro carácter que suena igual.
 * Las palabras de más no restan. Devuelve el porcentaje de la frase que se reconoció. */
const CHAR_MODE = ['zh', 'ja', 'ko'].includes(L.code);
const STRICT = {flex: 0.6, normal: 0.75, strict: 0.9};
function kataToHira(s){ return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)); }
function phonFold(w){ return w.replace(/(.)\1+/g, '$1').replace(/ph/g, 'f').replace(/([bcdfgkprt])h/g, '$1').replace(/y/g, 'i').replace(/w/g, 'u'); }
function normTok(w){
  let s = String(w || '').toLowerCase();
  if (L.latin) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  if (L.code === 'ru') s = s.replace(/ё/g, 'е');
  if (L.code === 'ja') s = kataToHira(s);
  s = s.replace(/[^\p{L}\p{N}]+/gu, '');
  if (L.latin && s && !/^\d+$/.test(s)) s = phonFold(s);
  return s;
}
const NUM_ES = {cero:'0', uno:'1', dos:'2', tres:'3', cuatro:'4', cinco:'5', seis:'6', siete:'7', ocho:'8', nueve:'9', diez:'10', cien:'100', mil:'1000'};
const NUM = {};
ALL.forEach(it => { const d = NUM_ES[it.es]; if (d != null) it.t.split(/\s*\/\s*/).forEach(v => { const k = normTok(v); if (k) NUM[k] = d; }); });
// Chino: pinyin de cada carácter calculado con contexto (银行 → yín háng), sin tono y con tono.
if (L.code === 'zh'){ NUM['两'] = '2'; NUM['俩'] = '2'; }
function zhPinyin(text){
  if (L.code !== 'zh' || !window.pinyinPro) return null;
  try{
    return {none: pinyinPro.pinyin(text, {type: 'array', toneType: 'none'}), num: pinyinPro.pinyin(text, {type: 'array', toneType: 'num'}), mark: pinyinPro.pinyin(text, {type: 'array'})};
  }catch(e){ return null; }
}
// Confusiones típicas de hispanohablantes: zh/z/j, ch/c/q, sh/s/x, r/l, ü/u, -ng/-n.
function zhFuzzy(py, level){
  let s = py.replace(/ü|v/g, 'u').replace(/ng$/, 'n');
  if (level === 'flex') s = s.replace(/^zh|^j/, 'z').replace(/^ch|^q/, 'c').replace(/^sh|^x/, 's').replace(/^r/, 'l');
  return s;
}
function tokenize(text){
  const t = String(text).replace(/\(.*?\)/g, ' ');
  const zp = zhPinyin(t);
  const mk = (d, off) => {
    const key = normTok(d), o = {disp: d, key};
    if (key && zp && /\p{Script=Han}/u.test(d) && zp.none[off] && zp.none[off] !== d){
      o.py = zp.none[off].replace(/ü/g, 'v'); o.pyT = zp.num[off]; o.pyMark = zp.mark[off];
    }
    return o;
  };
  if (CHAR_MODE){
    const out = [];
    // Las cifras y palabras latinas dentro de texto asiático se tratan como una sola unidad.
    t.replace(/[0-9]+|[A-Za-z]+|[\s\S]/gu, (m, off) => { out.push(mk(m, off)); return m; });
    return out;
  }
  return t.split(/(\s+)/).filter(x => x !== '').map(w => /^\s+$/.test(w) ? {disp: w, key: ''} : mk(w));
}
function tokEq(a, b){
  if (a.key === b.key) return true;
  if (NUM[a.key] && NUM[a.key] === (NUM[b.key] || b.key)) return true;
  if (NUM[b.key] && NUM[b.key] === a.key) return true;
  if (a.py && b.py){
    const lv = settings.strict || 'flex';
    if (lv === 'strict'){   // exige también el tono (el neutro, 0, vale con cualquiera)
      const ta = a.pyT.slice(-1), tb = b.pyT.slice(-1);
      return a.py === b.py && (ta === tb || ta === '0' || tb === '0' || !/\d/.test(ta) || !/\d/.test(tb));
    }
    return zhFuzzy(a.py, lv) === zhFuzzy(b.py, lv);
  }
  if (CHAR_MODE) return false;
  const x = a.key, y = b.key, d = lev(x, y);
  return x.length >= 6 ? d <= 2 : x.length >= 3 ? d <= 1 : false;
}
function lcsHits(exp, said){
  const m = exp.length, n = said.length;
  const dp = Array.from({length: m + 1}, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
    dp[i][j] = tokEq(exp[i], said[j]) ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const hits = new Set(); let i = 0, j = 0;
  while (i < m && j < n){ if (tokEq(exp[i], said[j])){ hits.add(i); i++; j++; } else if (dp[i+1][j] >= dp[i][j+1]) i++; else j++; }
  return hits;
}
function evaluateSpeech(alts, it){
  let best = null;
  String(it.t).split(/\s*\/\s*/).forEach(variant => {
    const toks = tokenize(variant), scored = toks.filter(x => x.key);
    if (!scored.length) return;
    alts.forEach(alt => {
      const said = tokenize(alt).filter(x => x.key);
      const hitIdx = lcsHits(scored, said);
      // En chino, la 儿 final (哪儿) es opcional: el reconocedor suele omitirla.
      const optional = scored.filter((x, k) => x.disp === '儿' && k > 0 && !hitIdx.has(k)).length;
      const score = hitIdx.size / Math.max(1, scored.length - optional);
      if (!best || score > best.score){
        const hitToks = new Set(Array.from(hitIdx).map(k => scored[k]));
        best = {score, said: alt, toks, hitToks};
      }
    });
  });
  if (!best) return {ok: false, score: 0, said: alts[0] || '', html: esc(it.t)};
  best.ok = best.score >= (STRICT[settings.strict] || STRICT.flex);
  best.html = best.toks.map(x => {
    if (!x.key) return esc(x.disp);
    const cls = best.hitToks.has(x) ? 'w-hit' : (x.disp === '儿' && L.code === 'zh') ? 'w-opt' : 'w-miss';
    return x.pyMark ? `<ruby class="${cls}">${esc(x.disp)}<rt>${esc(x.pyMark)}</rt></ruby>` : `<span class="${cls}">${esc(x.disp)}</span>`;
  }).join('');
  if (L.code === 'zh'){ const zp = zhPinyin(best.said); if (zp) best.saidPy = zp.mark.filter(x => /[a-zü]/i.test(x)).join(' '); }
  return best;
}
function speechFeedbackHTML(ev, opts){
  const pct = Math.round(ev.score * 100);
  if (ev.ok) return `✅ ¡Correcto!${pct < 100 ? ` (${pct}%)` : ''} <span class="marks" lang="${L.voice}">${ev.html}</span>`;
  return `<div>❌ ${pct}% — se entendió: «${esc(ev.said)}»${ev.saidPy ? ` <span class="said-py">(${esc(ev.saidPy)})</span>` : ''}</div>
    <div class="marks" lang="${L.voice}">${ev.html}</div>
    <div class="fb-actions">${L.code === 'zh' ? 'En rojo, las sílabas que no se reconocieron: compara su pinyin con lo que se entendió.' : 'En rojo, lo que no se reconoció.'} ${opts && opts.override ? `<button class="link-btn" data-act="${opts.override}" data-id="${opts.id || ''}">✓ Lo dije bien, contar como correcta</button>` : ''}</div>`;
}

let activeRec = null;
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/* Escucha robusta:
 * - Solo dice «Habla ahora» cuando el micrófono está realmente encendido (onaudiostart).
 * - Usa resultados parciales: si el navegador no entrega un resultado «final», se usa lo último que oyó.
 * - Modo continuo (salvo iPhone): no corta en la primera pausa; termina tras ~1,2 s de silencio después de hablar.
 * - Si no oyó nada, reintenta solo una vez antes de rendirse (ventana total de ~10 s).
 * - Tocar el micrófono otra vez detiene la escucha y evalúa lo oído. */
function listen(onText, onErr, onStatus){
  onStatus = onStatus || (() => {});
  if (!window.isSecureContext){ onErr('⚠️ El micrófono necesita que la página se abra por https:// (por ejemplo, desde GitHub Pages o Netlify), no como archivo.'); return null; }
  if (!SR){ onErr('Tu navegador no tiene reconocimiento de voz. Prueba con Chrome (Android o escritorio) o Safari en iPhone.'); return null; }
  if (activeRec) activeRec.cancel();
  stopAudio();
  const session = {finished: false, alts: [], heard: false, attempts: 0, rec: null, silenceT: null, maxT: null};
  const finish = (fn) => {
    if (session.finished) return; session.finished = true;
    clearTimeout(session.silenceT); clearTimeout(session.maxT); clearTimeout(session.finalT);
    try{ session.rec && session.rec.abort(); }catch(e){}
    if (activeRec === session) activeRec = null;
    fn();
  };
  const deliver = () => finish(() => {
    if (session.alts.length) onText(session.alts);
    else if (session.heard) onErr('Te oí, pero no entendí las palabras. Acércate al micrófono y habla un poco más despacio.');
    else onErr('No se detectó voz. Espera a ver «Habla ahora» y prueba otra vez (revisa que el micrófono correcto esté permitido).');
  });
  session.stop = () => { if (session.alts.length || session.heard){ onStatus('checking'); finalize(); } else finish(() => onErr('')); };   // segundo toque
  session.cancel = () => finish(() => {});
  // Tras ~1,2 s de silencio pide al reconocedor su resultado definitivo (más preciso que el parcial).
  const finalize = () => { session.stopping = true; clearTimeout(session.silenceT); try{ session.rec.stop(); }catch(e){} clearTimeout(session.finalT); session.finalT = setTimeout(deliver, 1800); };
  const armSilence = () => { clearTimeout(session.silenceT); session.silenceT = setTimeout(finalize, 1200); };
  function start(){
    session.attempts++;
    const rec = new SR(); session.rec = rec;
    rec.lang = L.voice; rec.maxAlternatives = 5; rec.interimResults = true; rec.continuous = !IS_IOS;
    rec.onaudiostart = () => { onStatus('ready'); if (navigator.vibrate) try{ navigator.vibrate(25); }catch(e){} };
    rec.onspeechstart = () => { session.heard = true; onStatus('hearing'); };
    rec.onresult = e => {
      session.heard = true;
      const results = Array.from(e.results), last = results[results.length - 1];
      const prefix = results.slice(0, -1).map(r => r[0].transcript).join(' ');
      const alts = Array.from(last).map(r => (prefix + ' ' + r.transcript).trim());
      alts.push(...Array.from(last).map(r => r.transcript.trim()));        // por si el navegador repite segmentos
      session.alts = Array.from(new Set(alts)).filter(Boolean);
      session.final = last.isFinal;
      onStatus('hearing', session.alts[0]);
      if (last.isFinal && (!rec.continuous || session.stopping)) deliver(); else armSilence();
    };
    rec.onerror = e => {
      if (session.finished) return;
      if (e.error === 'no-speech' || e.error === 'aborted') return;          // lo resuelve onend
      const m = {'not-allowed': 'Necesitas permitir el micrófono para esta página (candado de la barra de direcciones → Micrófono → Permitir).',
        'service-not-allowed': 'El navegador bloqueó el reconocimiento de voz. En iPhone activa Ajustes › Safari › Micrófono, y Dictado en Ajustes › General › Teclado.',
        'audio-capture': 'No se encontró ningún micrófono. Revisa que esté conectado y permitido.',
        'network': 'El reconocimiento de voz necesita conexión a internet.', 'no-match': ''};
      if (e.error === 'no-match'){ deliver(); return; }
      finish(() => onErr(m[e.error] || 'Error al reconocer la voz: ' + e.error));
    };
    rec.onend = () => {
      if (session.finished) return;
      if (session.alts.length || session.heard){ deliver(); return; }
      if (session.attempts < 2){ onStatus('retry'); try{ start(); }catch(e){ deliver(); } return; }  // reintento silencioso
      deliver();
    };
    try{ rec.start(); }catch(e){ finish(() => onErr('No se pudo iniciar el micrófono. Cierra otras apps que lo estén usando e inténtalo de nuevo.')); }
  }
  activeRec = session;
  onStatus('starting');
  session.maxT = setTimeout(deliver, 11000);
  start();
  return session;
}
const MIC_MSG = {checking: '⏳ Comprobando…', starting: '⏳ Encendiendo el micrófono…', ready: '🎤 Habla ahora', hearing: '👂 Te escucho…', retry: '🎤 Sigo escuchando, habla ahora'};

/* ---------------- Efectos ---------------- */
function chime(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175, 1568].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + i * 0.09;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.26);
    });
  }catch(e){}
}
function celebrate(id){
  const card = document.getElementById('card-' + id);
  chime();
  if (!card) return;
  card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 700);
  const b = document.createElement('div'); b.className = 'burst'; b.textContent = '✨'; card.appendChild(b); setTimeout(() => b.remove(), 850);
}
function toast(msg, ms){
  let host = $('.toast-host');
  if (!host){ host = document.createElement('div'); host.className = 'toast-host'; host.setAttribute('role', 'status'); document.body.appendChild(host); }
  if (Array.from(host.children).some(c => c.textContent === msg)) return;   // sin duplicados
  while (host.children.length >= 2) host.firstChild.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; host.appendChild(t);
  setTimeout(() => t.remove(), ms || 3600);
}

/* ---------------- Tema ---------------- */
function applyTheme(dark){ document.body.classList.toggle('dark', dark); const b = $('#themeBtn'); if (b) b.textContent = dark ? '☀️' : '🌙'; }
function initTheme(){
  const saved = store.raw('idiomas-theme') || store.raw(P + '-theme') || store.raw('lang-hub-theme');
  applyTheme(saved ? saved === 'dark' : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches));
}
function toggleTheme(){ const d = !document.body.classList.contains('dark'); applyTheme(d); store.setRaw('idiomas-theme', d ? 'dark' : 'light'); }
function applyDisplay(){ document.body.classList.toggle('hide-roman', !settings.roman); document.body.classList.toggle('hide-es', !!settings.hideEs); }

/* ---------------- Estructura de la página ---------------- */
function shell(){
  document.title = L.hero + ' — Plan de un año';
  document.getElementById('app').innerHTML = `
  <div class="wrap">
    <div class="topbar">
      <a class="back-link" href="index.html">← Idiomas</a>
      <div class="icon-row">
        <button class="icon-btn" id="themeBtn" title="Cambiar tema" aria-label="Cambiar tema">🌙</button>
        <button class="icon-btn" data-act="settings" title="Ajustes" aria-label="Ajustes">⚙️</button>
      </div>
    </div>
    <header class="hero">
      <div class="hero-title">${esc(L.hero)}</div>
      <div class="hero-sub">Plan de un año para hablar ${esc(L.langEs)} con fluidez: escucha, repite con el micrófono, repasa a diario y mide tu avance.</div>
      <div class="seal">${esc(L.seal)}</div>
      <div class="stat-chips" id="chips"></div>
      <div class="progress-bar"><div class="progress-fill" id="progFill"></div></div>
      <div class="progress-label" id="progText"></div>
    </header>
    <div class="actions">
      <button class="action primary" data-act="review"><span class="a-icon">🔁</span><span class="a-title">Repaso de hoy</span><span class="a-sub" id="reviewSub"></span></button>
      <button class="action" data-act="practice"><span class="a-icon">🎯</span><span class="a-title">Practicar</span><span class="a-sub">5 modos de ejercicio</span></button>
      <button class="action" data-act="stats"><span class="a-icon">📊</span><span class="a-title">Mi progreso</span><span class="a-sub">Estadísticas y calendario</span></button>
    </div>
    <div class="search-row">
      <span class="s-icon">🔎</span>
      <input id="search" type="search" placeholder="Buscar en ${esc(L.langEs)} o en español…" autocomplete="off" aria-label="Buscar frases">
      <button class="s-clear hidden" id="searchClear" aria-label="Borrar búsqueda">✕</button>
    </div>
    <nav class="phases" id="nav" aria-label="Secciones"></nav>
    <main id="view"></main>
    <div class="footer-note">Tu progreso se guarda automáticamente en este navegador (puedes hacer una copia desde la página de inicio).<br>
    El audio usa la voz en ${esc(L.langEs)} de tu dispositivo; si no oyes nada, abre ⚙️ Ajustes → Voz.</div>
  </div>
  <div class="overlay" id="overlay" aria-modal="true" role="dialog"><div class="sheet" id="sheet" tabindex="-1"></div></div>`;
}

function renderHeader(){
  const due = dueIds().length, xp = xpToday(), st = streakNow();
  const pct = Math.min(100, Math.round(xp / settings.goal * 100));
  $('#chips').innerHTML = `
    <span class="chip" title="Días seguidos practicando"><span class="em">🔥</span>${st ? plural(st, 'día', 'días') + ' de racha' : 'Practica hoy para empezar tu racha'}</span>
    <span class="chip" title="Experiencia de hoy"><span class="goal-ring" style="--p:${pct}"></span>${xp}/${settings.goal} XP hoy</span>
    <span class="chip" title="Frases dominadas"><span class="em">✅</span>${masteredCount()} / ${ALL.length}</span>`;
  $('#reviewSub').textContent = due ? plural(due, 'tarjeta pendiente', 'tarjetas pendientes') : (Object.keys(srs).length ? 'Todo al día ✓' : 'Aprende frases para empezar');
}
function renderProgress(){
  const tasksDone = TASKS.filter(id => prog[id]).length;
  const audio = ALL.reduce((s, it) => s + Math.min(prog[it.id] || 0, MASTERY) / MASTERY, 0);
  const pct = Math.round((tasksDone + audio) / (TASKS.length + ALL.length) * 100);
  $('#progFill').style.width = pct + '%';
  $('#progText').textContent = `${pct}% del plan · ${tasksDone} de ${TASKS.length} hábitos · ${masteredCount()} de ${ALL.length} frases dominadas`;
  renderHeader();
}
function phasePct(ph){ const ids = ph._ids; return ids.length ? Math.round(ids.reduce((s, id) => s + Math.min(prog[id] || 0, MASTERY), 0) / (ids.length * MASTERY) * 100) : 0; }
let currentPhase = 0;
function renderNav(){
  $('#nav').innerHTML = PHASES.map((ph, i) => {
    const pct = phasePct(ph);
    const num = ph.key === 'pron' ? '★' : i;
    return `<button data-act="phase" data-i="${i}" class="${i === currentPhase && !searchQuery ? 'active' : ''}"><span class="num">${num}</span>${esc(ph.title)}<span class="pct">${pct === 100 ? '🏅' : pct + '%'}</span></button>`;
  }).join('');
}

function cardHTML(it){
  const c = Math.min(prog[it.id] || 0, MASTERY);
  let dots = '';
  for (let i = 0; i < MASTERY; i++) dots += `<span class="dot ${i < c ? 'on' : ''}"></span>`;
  return `<div class="card ${c >= MASTERY ? 'mastered' : ''}" id="card-${it.id}">
    <div class="card-row">
      <div class="btns">
        <button class="round play" data-act="play" data-id="${it.id}" title="Escuchar" aria-label="Escuchar">▶</button>
        <button class="round mic" data-act="mic" data-id="${it.id}" title="Decirlo en voz alta" aria-label="Grabar mi pronunciación">🎤</button>
      </div>
      <div class="txt">
        <div class="t" lang="${L.voice}">${esc(it.t)}</div>
        <div class="r">${esc(it.r)}</div>
        ${sameAsRoman(it) ? '' : `<div class="es" data-act="reveal" data-id="${it.id}">${esc(it.es)}</div>`}
      </div>
    </div>
    <div class="card-foot">
      <div class="dots" id="dots-${it.id}"><span class="lbl">Dominio</span>${dots}</div>
      <span class="spacer"></span>
      <button class="mini" data-act="slow" data-id="${it.id}" title="Escuchar despacio" aria-label="Escuchar despacio">🐢</button>
      <button class="mini ${fav.has(it.id) ? 'fav-on' : ''}" data-act="fav" data-id="${it.id}" title="Favorita" aria-label="Marcar como favorita">${fav.has(it.id) ? '★' : '☆'}</button>
    </div>
    <div class="feedback" id="fb-${it.id}"></div>
  </div>`;
}
function updateCard(id){
  const card = document.getElementById('card-' + id); if (!card) return;
  const c = Math.min(prog[id] || 0, MASTERY);
  card.classList.toggle('mastered', c >= MASTERY);
  $$('.dot', card).forEach((d, i) => d.classList.toggle('on', i < c));
}

function renderPhase(i){
  currentPhase = i; searchQuery = '';
  const ph = PHASES[i];
  store.setRaw(K.phase, ph.key);
  const tasks = (ph.tasks || []).map((t, ti) => {
    const id = `t-${ph.key}-${ti}`, on = !!prog[id];
    return `<label class="task-row"><input type="checkbox" data-task="${id}" ${on ? 'checked' : ''}>
      <div><div class="task-name ${on ? 'done' : ''}">${esc(t.name)}</div><div class="task-meta">${esc(t.time)} · <span class="tool">${esc(t.tool)}</span></div></div></label>`;
  }).join('');
  let cards = '';
  if (ph.groups){
    ph.groups.forEach(g => {
      const items = ALL.filter(it => it.pi === i && it.label === g.label);
      const m = items.filter(it => (prog[it.id] || 0) >= MASTERY).length;
      cards += `<div class="group-label"><span>${esc(g.label)}</span><span class="g-count">${m}/${items.length}</span></div><div class="audio-grid">${items.map(cardHTML).join('')}</div>`;
    });
  } else {
    cards = `<div class="audio-grid">${ALL.filter(it => it.pi === i).map(cardHTML).join('')}</div>`;
  }
  $('#view').innerHTML = `
    <section>
      <div class="phase-head"><h2>${esc(ph.title)}</h2><span class="tag">${esc(ph.months)}</span></div>
      <div class="phase-focus">${esc(ph.focus)}</div>
      ${ph.legend ? `<div class="legend"><b>Cómo leer la pronunciación —</b> ${esc(ph.legend)}</div>` : ''}
      ${tasks ? `<details class="habits"><summary>Hábitos y meta de esta sección <span class="chev">▸</span></summary><div class="task-list">${tasks}</div>
        <div class="milestone"><b>Meta —</b> ${esc(ph.milestone)}</div></details>` : ''}
      <div class="section-title">${ph.groups ? 'Vocabulario y frases' : 'Frases de esta sección'}</div>
      <div class="hint">Toca ▶ para oír, luego 🎤 y dilo en voz alta. Con ${MASTERY} aciertos (micrófono, práctica o repaso) la frase queda dominada.${L.code === 'zh' ? ' Consejo: di la frase entera de corrido; el reconocedor entiende mejor frases completas que sílabas sueltas.' : ''}</div>
      ${cards}
      <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-act="practice-phase">🎯 Practicar esta sección</button>
        ${i < PHASES.length - 1 ? `<button class="btn" data-act="phase" data-i="${i+1}">Siguiente: ${esc(PHASES[i+1].title)} →</button>` : ''}
      </div>
    </section>`;
  renderNav();
  const btn = $('#nav button.active'); if (btn && btn.scrollIntoView) btn.scrollIntoView({block: 'nearest', inline: 'center'});
}

/* ---------------- Búsqueda ---------------- */
let searchQuery = '';
function fold(s){ return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function renderSearch(q){
  searchQuery = q;
  const f = fold(q.trim());
  $('#searchClear').classList.toggle('hidden', !q);
  if (!f){ renderPhase(currentPhase); return; }
  const res = ALL.filter(it => fold(it.t).includes(f) || fold(it.es).includes(f) || fold(it.r).includes(f));
  renderNav();
  $('#view').innerHTML = `<div class="section-title">${plural(res.length, 'resultado', 'resultados')} para «${esc(q.trim())}»</div><div class="hint">Busca en ${esc(L.langEs)}, en la pronunciación o en español.</div>` +
    (res.length ? `<div class="audio-grid">${res.slice(0, 80).map(it => cardHTML(it).replace('<div class="card-foot">', `<div class="muted" style="font-size:11.5px">${esc(PHASES[it.pi].title)}${it.label ? ' · ' + esc(it.label) : ''}</div><div class="card-foot">`)).join('')}</div>` : `<div class="empty">No encontré nada. Prueba con otra palabra.</div>`);
}

/* ---------------- Ventanas (sheet) ---------------- */
let sheetKeys = null;
function openSheet(html, keys){
  const sh = $('#sheet'), wasOpen = $('#overlay').classList.contains('open');
  sh.innerHTML = html; $('#overlay').classList.add('open'); sheetKeys = keys || null; document.body.style.overflow = 'hidden';
  // El foco pasa a la ventana para que funcionen los atajos (y no se quede en la página de fondo).
  if (!sh.contains(document.activeElement) || !wasOpen) sh.focus({preventScroll: true});
}
function closeSheet(){ $('#overlay').classList.remove('open'); sheetKeys = null; document.body.style.overflow = ''; stopAudio(); if (activeRec) activeRec.cancel(); quiz = null; review = null; renderHeader(); }
const head = title => `<div class="sheet-head"><h3>${title}</h3><button class="close-x" data-act="close" aria-label="Cerrar">✕</button></div>`;

/* ---------------- Repaso espaciado ---------------- */
let review = null;
function startReview(){
  const ids = dueIds().slice(0, REVIEW_CAP);
  if (!ids.length){
    const learned = Object.keys(srs).length;
    openSheet(head('Repaso de hoy') + `<div class="empty" style="padding:20px 0">${learned ?
      `🎉 ¡Todo al día! Tienes ${plural(learned, 'frase', 'frases')} en repaso.<br>La próxima tanda llega ${nextDueLabel()}.` :
      'Todavía no hay tarjetas.<br>Cada frase que aciertes con 🎤 o en Practicar entra aquí y vuelve justo antes de que la olvides.'}</div>
      <button class="btn main block" data-act="practice">🎯 Practicar frases nuevas</button>`);
    return;
  }
  review = {queue: ids.slice(), done: 0, total: ids.length, shown: false, again: {}};
  renderReview();
}
function nextDueLabel(){
  const ds = Object.values(srs).map(c => c.due).filter(d => d > today()).sort();
  if (!ds.length) return 'pronto';
  const d = ds[0], diff = Math.round((new Date(d) - new Date(today())) / 86400000);
  return diff <= 1 ? 'mañana' : 'en ' + diff + ' días';
}
function intervalLabel(id, g){
  const box = srs[id] ? srs[id].box : 0;
  if (g === 0) return 'hoy';
  const n = INTERVALS[Math.min(box + (g === 2 ? 2 : 1), INTERVALS.length - 1)];
  return n === 1 ? '1 día' : n + ' días';
}
function renderReview(){
  const r = review; if (!r) return;
  if (!r.queue.length){
    openSheet(head('Repaso terminado') + `<div class="result"><div class="score">✓</div><div>Repasaste ${plural(r.total, 'tarjeta', 'tarjetas')}. ${dueIds().length ? 'Quedan ' + dueIds().length + ' para otra tanda.' : '¡Todo al día!'}</div>
      <button class="btn main block" data-act="${dueIds().length ? 'review' : 'close'}">${dueIds().length ? 'Seguir repasando' : 'Cerrar'}</button></div>`);
    return;
  }
  const id = r.queue[0], it = BY_ID[id];
  const pct = Math.round(r.done / (r.done + r.queue.length) * 100);
  openSheet(head('Repaso de hoy') + `
    <div class="q-progress"><span>${r.queue.length} por repasar</span><span>${r.done} hechas</span></div>
    <div class="q-bar"><div style="width:${pct}%"></div></div>
    <div class="flash-card">
      <div class="q-big" lang="${L.voice}">${esc(it.t)}</div>
      <button class="round play q-play" data-act="say" data-text="${esc(it.t)}" aria-label="Escuchar">▶</button>
      ${r.shown ? `<div class="back"><div class="q-small">${esc(it.r)}</div>${sameAsRoman(it) ? '' : `<div class="q-es" style="margin-top:6px">${esc(it.es)}</div>`}</div>` : '<div class="muted" style="font-size:13px">¿Recuerdas qué significa?</div>'}
    </div>
    ${r.shown ? `<div class="grade">
        <button class="g-again" data-act="grade" data-g="0">Otra vez<small>${intervalLabel(id, 0)}</small></button>
        <button class="g-good" data-act="grade" data-g="1">Bien<small>${intervalLabel(id, 1)}</small></button>
        <button class="g-easy" data-act="grade" data-g="2">Fácil<small>${intervalLabel(id, 2)}</small></button></div>
        <div class="kbd-hint">Teclado: 1 · 2 · 3</div>`
      : `<button class="btn main block" data-act="show">Mostrar respuesta</button><div class="kbd-hint">Teclado: espacio</div>`}`,
    k => { if (!review) return; if (!review.shown && (k === ' ' || k === 'Enter')) return revShow(); if (review.shown && '123'.includes(k)) return revGrade(+k - 1); });
  if (!r.shown && !r.spoken){ r.spoken = id; speak(it.t, {btn: $('#sheet .q-play')}); }
}
function revShow(){ review.shown = true; renderReview(); }
function revGrade(g){
  const r = review, id = r.queue.shift();
  const c = srs[id] || {box: 0};
  if (g === 0){ c.box = 0; c.due = today(); if (!r.again[id]){ r.again[id] = 1; r.queue.push(id); } }
  else { c.box = Math.min(c.box + (g === 2 ? 2 : 1), INTERVALS.length - 1); c.due = addDays(today(), INTERVALS[c.box]); }
  c.last = today(); srs[id] = c; save.srs();
  r.done++; r.shown = false; r.spoken = null;
  addXP(1);
  if (g > 0) bumpMastery(id);
  renderReview();
}

/* ---------------- Práctica ---------------- */
const MODES = [
  {id: 'listen', ic: '👂', t: 'Escuchar y elegir', s: 'Oyes la frase y eliges qué significa'},
  {id: 'read', ic: '👀', t: 'Leer y elegir', s: 'Lees la frase y eliges la traducción'},
  {id: 'reverse', ic: '🔄', t: 'Del español', s: 'Ves el español y eliges la frase correcta'},
  {id: 'write', ic: '⌨️', t: 'Dictado', s: L.latin ? 'Oyes la frase y la escribes' : 'Oyes la frase y la escribes (también vale la pronunciación)'},
  {id: 'speak', ic: '🗣️', t: 'Dilo tú', s: 'Ves el español y lo dices en voz alta'},
];
const SCOPES = [
  {id: 'phase', t: 'Esta sección'}, {id: 'learned', t: 'Ya practicadas'}, {id: 'weak', t: 'Difíciles'}, {id: 'fav', t: 'Favoritas ★'}, {id: 'all', t: 'Todo'},
];
let practiceCfg = Object.assign({mode: 'listen', scope: 'phase', n: 10}, store.get('idiomas-practice', {}) || {});
function scopePool(scope){
  switch (scope){
    case 'phase': return ALL.filter(it => it.pi === currentPhase);
    case 'learned': return ALL.filter(it => (prog[it.id] || 0) > 0 || srs[it.id]);
    case 'weak': return ALL.filter(it => srs[it.id] && srs[it.id].box <= 1);
    case 'fav': return ALL.filter(it => fav.has(it.id));
    default: return ALL;
  }
}
function openPractice(scope){
  if (scope) practiceCfg.scope = scope;
  const counts = Object.fromEntries(SCOPES.map(s => [s.id, scopePool(s.id).length]));
  openSheet(head('Practicar') + `
    <div class="lbl-sm">Modo</div>
    <div class="mode-list">${MODES.map(m => `<button class="mode ${practiceCfg.mode === m.id ? 'on' : ''}" data-act="pmode" data-v="${m.id}"><span class="m-ic">${m.ic}</span><span><div class="m-t">${m.t}</div><div class="m-s">${esc(m.s)}</div></span></button>`).join('')}</div>
    <div class="lbl-sm">Frases</div>
    <div class="seg">${SCOPES.map(s => `<button class="${practiceCfg.scope === s.id ? 'on' : ''}" data-act="pscope" data-v="${s.id}" ${counts[s.id] ? '' : 'disabled style="opacity:.4"'}>${s.t} <span class="muted">${counts[s.id]}</span></button>`).join('')}</div>
    <div class="muted" style="font-size:12px;margin-top:6px">${practiceCfg.scope === 'phase' ? 'Sección: ' + esc(PHASES[currentPhase].title) : ''}</div>
    <div class="lbl-sm">Preguntas</div>
    <div class="seg">${[5, 10, 20].map(n => `<button class="${practiceCfg.n === n ? 'on' : ''}" data-act="pn" data-v="${n}">${n}</button>`).join('')}</div>
    <button class="btn main block" data-act="pstart" ${counts[practiceCfg.scope] ? '' : 'disabled'}>Empezar</button>`);
}
let quiz = null;
function startQuiz(){
  store.set('idiomas-practice', practiceCfg);
  let pool = scopePool(practiceCfg.scope);
  if (!pool.length){ toast('No hay frases en esta selección.'); return; }
  // Prioriza lo pendiente de repaso y lo menos dominado, con algo de azar.
  pool = shuffle(pool).sort((a, b) => (Math.min(prog[a.id] || 0, 3) - Math.min(prog[b.id] || 0, 3)) * 0.5 + (Math.random() - 0.5));
  const items = pool.slice(0, practiceCfg.n);
  quiz = {mode: practiceCfg.mode, items, i: 0, score: 0, answered: false, misses: []};
  renderQuiz();
}
function distractors(it, field, n){
  const same = shuffle(ALL.filter(x => x.pi === it.pi && x[field] !== it[field] && x.es !== it.es));
  const rest = shuffle(ALL.filter(x => x.pi !== it.pi && x[field] !== it[field] && x.es !== it.es));
  const out = [], seen = new Set([it[field]]);
  for (const x of same.concat(rest)){ if (!seen.has(x[field])){ seen.add(x[field]); out.push(x); } if (out.length >= n) break; }
  return out;
}
function renderQuiz(){
  const q = quiz; if (!q) return;
  if (q.i >= q.items.length) return renderQuizResult();
  const it = q.items[q.i];
  const top = `${head(MODES.find(m => m.id === q.mode).t)}
    <div class="q-progress"><span>Pregunta ${q.i + 1} de ${q.items.length}</span><span>Aciertos: ${q.score}</span></div>
    <div class="q-bar"><div style="width:${q.i / q.items.length * 100}%"></div></div>`;
  let prompt = '', body = '', keys = null;
  const playBtn = `<button class="round play q-play" data-act="say" data-text="${esc(it.t)}" aria-label="Escuchar">▶</button>`;
  if (q.mode === 'listen' || q.mode === 'read' || q.mode === 'reverse'){
    const field = q.mode === 'reverse' ? 't' : 'es';
    if (!q.opts) q.opts = shuffle([it].concat(distractors(it, field, 3)));
    if (q.mode === 'listen') prompt = `${playBtn}<div class="muted" style="font-size:13px;margin-top:8px">${q.answered ? `<span class="q-big" style="font-size:24px" lang="${L.voice}">${esc(it.t)}</span><div class="q-small">${esc(it.r)}</div>` : '¿Qué significa?'}</div>`;
    if (q.mode === 'read') prompt = `<div class="q-big" lang="${L.voice}">${esc(it.t)}</div><div class="q-small">${esc(it.r)}</div><div style="margin-top:8px"><button class="link-btn" data-act="say" data-text="${esc(it.t)}">▶ oír</button></div>`;
    if (q.mode === 'reverse') prompt = `<div class="q-es">${esc(it.es)}</div><div class="muted" style="font-size:13px;margin-top:6px">¿Cómo se dice en ${esc(L.langEs)}?</div>`;
    body = `<div class="q-opts">${q.opts.map((o, k) => {
      let cls = '';
      if (q.answered){ if (o.id === it.id) cls = 'ok'; else if (o.id === q.picked) cls = 'bad'; }
      const label = field === 't' ? `<span><span lang="${L.voice}" style="font-weight:700">${esc(o.t)}</span>${settings.roman ? `<br><span class="muted" style="font-size:12.5px">${esc(o.r)}</span>` : ''}</span>` : `<span>${esc(o.es)}</span>`;
      return `<button class="q-opt ${cls}" data-act="qpick" data-id="${o.id}" ${q.answered ? 'disabled' : ''}><span class="k">${k + 1}</span>${label}</button>`;
    }).join('')}</div>`;
    keys = k => { if (!q.answered && '1234'.includes(k) && q.opts[+k - 1]) qPick(q.opts[+k - 1].id); else if (q.answered && (k === 'Enter' || k === ' ')) qNext(); };
  } else if (q.mode === 'write'){
    prompt = `${playBtn}<div style="margin-top:8px"><button class="link-btn" data-act="say-slow" data-text="${esc(it.t)}">🐢 más despacio</button> · <button class="link-btn" data-act="hint">pista</button></div>
      <div class="muted" id="qHint" style="font-size:13px;margin-top:6px">${q.hint || q.answered ? esc(it.es) : ''}</div>`;
    body = `<input class="q-input ${q.answered ? (q.correct ? 'ok' : 'bad') : ''}" id="qIn" lang="${L.voice}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Escribe lo que oyes…" value="${esc(q.typed || '')}" ${q.answered ? 'disabled' : ''}>
      ${q.answered ? `<div class="q-answer">${q.correct ? (q.near ? '✅ ¡Casi perfecto! Se escribe:' : '✅ ¡Correcto!') : '❌ La respuesta era:'}<div class="t" lang="${L.voice}">${esc(it.t)}</div><div class="q-small">${esc(it.r)}</div></div>` :
        `<button class="btn main block" data-act="qcheck">Comprobar</button>`}`;
    keys = k => { if (k === 'Enter'){ if (!q.answered) qCheck(); else qNext(); } };
  } else if (q.mode === 'speak'){
    prompt = `<div class="q-es">${esc(it.es)}</div><div class="muted" style="font-size:13px;margin-top:6px">Dilo en ${esc(L.langEs)}</div>
      ${q.answered || q.peek ? `<div style="margin-top:12px"><div class="q-big" style="font-size:24px" lang="${L.voice}">${esc(it.t)}</div><div class="q-small">${esc(it.r)}</div></div>` : ''}`;
    body = `<div class="speak-btns" style="display:flex;justify-content:center;gap:14px;margin:6px 0 4px">
        <button class="round mic q-play" data-act="qmic" ${q.answered ? 'disabled' : ''} aria-label="Hablar">🎤</button>
        <button class="round play q-play" data-act="say" data-text="${esc(it.t)}" aria-label="Escuchar la respuesta">▶</button></div>
      <div class="feedback ${q.fbClass || ''}" id="qFb" style="text-align:center">${q.fbHTML || esc(q.fb || '')}</div>
      ${q.answered ? '' : `<div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button class="link-btn" data-act="peek">Ver respuesta</button><span class="muted">·</span><button class="link-btn" data-act="qskip">No lo sé</button></div>`}`;
  }
  const next = q.answered ? `<button class="btn main block" data-act="qnext">${q.i + 1 < q.items.length ? 'Siguiente →' : 'Ver resultado'}</button>` : '';
  openSheet(top + `<div class="q-prompt">${prompt}</div>` + body + next, keys || (k => { if (q.answered && k === 'Enter') qNext(); }));
  if (q.mode === 'write' && !q.answered){ const inp = $('#qIn'); setTimeout(() => inp && inp.focus(), 60); }
  if ((q.mode === 'listen' || q.mode === 'write') && !q.answered && q.autoplayed !== q.i){ q.autoplayed = q.i; speak(it.t, {btn: $('#sheet .q-play')}); }
}
function qResult(ok, near){
  const q = quiz, it = q.items[q.i];
  q.answered = true; q.correct = ok; q.near = near;
  if (ok){ q.score++; addXP(1); bumpMastery(it.id); }
  else { q.misses.push(it); markWeak(it.id); }
  renderQuiz();
  if (q.mode !== 'listen' && q.mode !== 'write') speak(it.t);
}
function qPick(id){ const q = quiz; if (q.answered) return; q.picked = id; qResult(id === q.items[q.i].id); }
function qCheck(){
  const q = quiz, it = q.items[q.i], inp = $('#qIn');
  const typed = inp ? inp.value : '';
  q.typed = typed;
  if (!typed.trim()){ toast('Escribe tu respuesta primero.'); return; }
  const exact = variants(it.t).includes(norm(typed));
  let ok = exact || closeEnough(typed, it.t, 0.15);
  if (!ok && !L.latin){ const a = normRoman(typed), b = normRoman(it.r); ok = a && (a === b || lev(a, b) <= Math.max(1, Math.ceil(b.length * 0.15))); }
  qResult(ok, ok && !exact);
}
function qMic(){
  const q = quiz, it = q.items[q.i];
  if (activeRec && activeRec.quiz){ activeRec.stop(); return; }
  const btn = $('#sheet .mic'); if (btn) btn.classList.add('listening');
  const status = (msg, cls) => { q.fb = msg; q.fbHTML = null; q.fbClass = cls || ''; const fb = $('#qFb'); if (fb){ fb.textContent = msg; fb.className = 'feedback ' + (cls || ''); } };
  const rec = listen(alts => {
    const ev = evaluateSpeech(alts, it);
    q.fbHTML = speechFeedbackHTML(ev, ev.ok ? null : {override: 'qoverride'});
    if (ev.ok){ q.fbClass = 'ok'; qResult(true); }
    else { q.tries = (q.tries || 0) + 1; q.fbClass = 'bad'; if (q.tries >= 3) qResult(false); else renderQuiz(); }
  }, msg => { status(msg, msg ? 'bad' : ''); renderQuiz(); },
  (st, heard) => status(heard ? '👂 «' + heard + '»' : MIC_MSG[st]));
  if (rec) rec.quiz = true;
}
function qNext(){ const q = quiz; q.i++; q.answered = false; q.opts = null; q.picked = null; q.typed = ''; q.hint = false; q.fb = ''; q.fbHTML = null; q.fbClass = ''; q.tries = 0; q.peek = false; renderQuiz(); }
function renderQuizResult(){
  const q = quiz, pct = Math.round(q.score / q.items.length * 100);
  openSheet(head('Resultado') + `<div class="result">
    <div class="score">${q.score}/${q.items.length}</div>
    <div>${pct >= 90 ? '¡Excelente! 🎉' : pct >= 60 ? '¡Bien! Sigue así 💪' : 'Estas frases necesitan un poco más de práctica 📚'}</div>
    ${q.misses.length ? `<div class="miss-list"><div class="lbl-sm" style="margin-top:12px">Para repasar (vuelven en tu repaso de hoy)</div>${q.misses.map(it => `<div><button class="mini" data-act="say" data-text="${esc(it.t)}">▶</button> <b lang="${L.voice}">${esc(it.t)}</b> <span class="es">— ${esc(it.es)}</span></div>`).join('')}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:18px"><button class="btn" style="flex:1" data-act="practice">Cambiar modo</button><button class="btn main" style="flex:1" data-act="pstart">Otra ronda</button></div>
  </div>`, k => { if (k === 'Enter') startQuiz(); });
}

/* ---------------- Estadísticas ---------------- */
function openStats(){
  const learning = ALL.filter(it => { const c = prog[it.id] || 0; return (c > 0 && c < MASTERY) || (srs[it.id] && c < MASTERY); }).length;
  const totalXP = Object.values(log).reduce((a, b) => a + b, 0);
  const days = Object.keys(log).filter(d => log[d] > 0).length;
  // Calendario: 18 semanas terminando hoy
  const weeks = 18, t = today();
  const dow = (new Date().getDay() + 6) % 7; // lunes = 0
  const start = addDays(t, -(weeks - 1) * 7 - dow);
  let cells = '';
  for (let i = 0; i < weeks * 7; i++){
    const d = addDays(start, i);
    if (d > t){ cells += '<span style="visibility:hidden"></span>'; continue; }
    const x = log[d] || 0, lv = x === 0 ? 0 : x < settings.goal * 0.5 ? 1 : x < settings.goal ? 2 : x < settings.goal * 2 ? 3 : 4;
    cells += `<span class="l${lv} ${d === t ? 'today' : ''}" title="${d}: ${x} XP"></span>`;
  }
  const bars = PHASES.map(ph => { const p = phasePct(ph); return `<div class="pbar"><span>${esc(ph.title)}</span><span class="muted">${p}%</span><div class="track"><div style="width:${p}%"></div></div></div>`; }).join('');
  openSheet(head('Mi progreso en ' + esc(L.langEs)) + `
    <div class="stat-grid">
      <div class="stat"><div class="v">${masteredCount()}</div><div class="l">frases dominadas de ${ALL.length}</div></div>
      <div class="stat"><div class="v">${learning}</div><div class="l">aprendiendo</div></div>
      <div class="stat"><div class="v">🔥 ${streakNow()}</div><div class="l">racha actual · mejor: ${Math.max(streak.best || 0, streakNow())}</div></div>
      <div class="stat"><div class="v">${dueIds().length}</div><div class="l">para repasar hoy</div></div>
      <div class="stat"><div class="v">${totalXP}</div><div class="l">XP en total</div></div>
      <div class="stat"><div class="v">${days}</div><div class="l">días practicados</div></div>
    </div>
    <div class="lbl-sm">Actividad (últimas ${weeks} semanas)</div>
    <div class="heat-wrap"><div class="heat">${cells}</div></div>
    <div class="heat-legend">menos <span style="background:var(--heat0)"></span><span style="background:var(--heat1)"></span><span style="background:var(--heat2)"></span><span style="background:var(--heat3)"></span><span style="background:var(--heat4)"></span> más</div>
    <div class="lbl-sm">Dominio por sección</div>
    <div class="phase-bars">${bars}</div>`);
}

/* ---------------- Ajustes ---------------- */
async function openSettings(){
  const sw = (key, title, desc) => `<div class="set-row"><div><div class="s-t">${title}</div><div class="s-d">${desc}</div></div>
    <label class="switch"><input type="checkbox" data-set="${key}" ${settings[key] ? 'checked' : ''}><span></span></label></div>`;
  openSheet(head('Ajustes') + `
    <div class="lbl-sm" style="margin-top:0">Velocidad de la voz</div>
    <div class="seg">${[[0.6, 'Lenta'], [0.85, 'Normal'], [1, 'Rápida']].map(([v, l]) => `<button class="${settings.rate === v ? 'on' : ''}" data-act="rate" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="lbl-sm">Exigencia del micrófono</div>
    <div class="seg">${[['flex', 'Flexible'], ['normal', 'Normal'], ['strict', 'Estricta']].map(([v, l]) => `<button class="${settings.strict === v ? 'on' : ''}" data-act="strict" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="muted" style="font-size:12px;margin-top:6px">Qué parte de la frase debe reconocerse: flexible 60 %, normal 75 %, estricta 90 %.${L.code === 'zh' ? ' En chino, «Flexible» perdona las confusiones típicas (zh/z, ch/c, sh/s, x/s, q/c, r/l, -n/-ng) y no mira los tonos; «Estricta» exige además el tono correcto.' : ''}</div>
    <div class="lbl-sm">Meta diaria</div>
    <div class="seg">${[10, 20, 30, 50].map(v => `<button class="${settings.goal === v ? 'on' : ''}" data-act="goal" data-v="${v}">${v} XP</button>`).join('')}</div>
    <div class="muted" style="font-size:12px;margin-top:6px">XP: +2 por pronunciar bien con 🎤 · +1 por acierto en práctica o repaso · +5 al dominar una frase.</div>
    <div style="margin-top:8px">
      ${sw('roman', 'Mostrar pronunciación', 'Guía de lectura debajo de cada frase.')}
      ${sw('hideEs', 'Ocultar traducción', 'Modo autoevaluación: toca la traducción para verla.')}
    </div>
    <div class="lbl-sm">Voz</div>
    <select class="sel" id="voiceSel" aria-label="Voz"><option>Cargando voces…</option></select>
    <div class="voice-status" id="voiceStatus"></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" data-act="testvoice">🔊 Probar voz</button></div>
    <div class="lbl-sm">Zona de peligro</div>
    <button class="btn danger" data-act="reset">Reiniciar mi progreso en ${esc(L.langEs)}</button>`);
  await ensureVoices();
  const sel = $('#voiceSel'), st = $('#voiceStatus'); if (!sel) return;
  const lv = langVoices(), others = voices.filter(v => !lv.includes(v));
  const cur = chosenVoice();
  if (!voices.length){ sel.innerHTML = '<option>Sin voces en este navegador</option>'; sel.disabled = true; }
  else {
    sel.innerHTML = (lv.length ? `<optgroup label="Voces en ${esc(L.langEs)}">${lv.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</optgroup>` : '') +
      `<optgroup label="Otras voces">${others.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</optgroup>`;
    if (cur) sel.value = cur.name;
  }
  if (lv.length){ st.textContent = `✓ ${plural(lv.length, 'voz', 'voces')} en ${L.langEs} disponible${lv.length > 1 ? 's' : ''}.`; st.style.color = 'var(--done)'; }
  else { st.innerHTML = `No hay voz en ${esc(L.langEs)} instalada; se usará el audio en línea. Para instalar una: <b>Android</b> Ajustes › Sistema › Idiomas › Síntesis de voz · <b>iPhone</b> Ajustes › Accesibilidad › Contenido leído › Voces · <b>Windows</b> Configuración › Hora e idioma › Voz.`; st.style.color = 'var(--muted)'; }
}

function confirmReset(){
  openSheet(head('¿Reiniciar progreso?') + `<p>Se borrará tu progreso en ${esc(L.langEs)}: hábitos, dominio, repasos, favoritas, racha y XP. Los demás idiomas no se tocan.</p>
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn" style="flex:1" data-act="close">Cancelar</button><button class="btn main" style="flex:1" data-act="reset-yes">Sí, reiniciar</button></div>`);
}
function doReset(){
  prog = {}; srs = {}; fav = new Set(); log = {}; streak = {count: 0, lastDate: null, best: 0};
  save.prog(); save.srs(); save.fav(); save.log(); save.streak();
  closeSheet(); renderPhase(currentPhase); renderProgress(); toast('Progreso reiniciado.');
}

/* ---------------- Eventos ---------------- */
function onClick(e){
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act){
    case 'play': speak(BY_ID[id].t, {btn: el}); break;
    case 'slow': speak(BY_ID[id].t, {rate: 0.55, btn: $('#card-' + id + ' .play')}); break;
    case 'say': speak(el.dataset.text, {btn: el.classList.contains('round') ? el : null}); break;
    case 'say-slow': speak(el.dataset.text, {rate: 0.55}); break;
    case 'mic': cardMic(id, el); break;
    case 'fav':
      if (fav.has(id)) fav.delete(id); else fav.add(id);
      save.fav(); el.classList.toggle('fav-on', fav.has(id)); el.textContent = fav.has(id) ? '★' : '☆';
      if (fav.has(id)) toast('★ Añadida a favoritas — practícalas en 🎯 Practicar.', 2200);
      break;
    case 'reveal': { const c = $('#card-' + id); if (c) c.classList.toggle('reveal'); break; }
    case 'phase': $('#search').value = ''; renderPhase(+el.dataset.i); window.scrollTo({top: $('#nav').offsetTop - 10, behavior: 'smooth'}); break;
    case 'review': startReview(); break;
    case 'show': revShow(); break;
    case 'grade': revGrade(+el.dataset.g); break;
    case 'practice': openPractice(); break;
    case 'practice-phase': openPractice('phase'); break;
    case 'pmode': practiceCfg.mode = el.dataset.v; openPractice(); break;
    case 'pscope': practiceCfg.scope = el.dataset.v; openPractice(); break;
    case 'pn': practiceCfg.n = +el.dataset.v; openPractice(); break;
    case 'pstart': startQuiz(); break;
    case 'qpick': qPick(id); break;
    case 'qcheck': qCheck(); break;
    case 'qnext': qNext(); break;
    case 'qmic': qMic(); break;
    case 'peek': quiz.peek = true; renderQuiz(); speak(quiz.items[quiz.i].t); break;
    case 'qskip': qResult(false); break;
    case 'hint': quiz.hint = true; { const h = $('#qHint'); if (h) h.textContent = quiz.items[quiz.i].es; } break;
    case 'override': { const f = $('#fb-' + id); if (f){ f.innerHTML = '✓ Contada como correcta.'; f.className = 'feedback ok'; } addXP(1); bumpMastery(id); break; }
    case 'qoverride': if (quiz && !quiz.answered){ quiz.fbHTML = '✓ Contada como correcta.'; quiz.fbClass = 'ok'; qResult(true); } break;
    case 'strict': settings.strict = el.dataset.v; save.settings(); openSettings(); break;
    case 'stats': openStats(); break;
    case 'settings': openSettings(); break;
    case 'rate': settings.rate = +el.dataset.v; save.settings(); openSettings(); speak(ALL[0].t); break;
    case 'goal': settings.goal = +el.dataset.v; save.settings(); openSettings(); renderHeader(); break;
    case 'testvoice': speak(ALL.find(it => it.pi === PHASES.findIndex(p => p.key === '0')).t); break;
    case 'reset': confirmReset(); break;
    case 'reset-yes': doReset(); break;
    case 'close': closeSheet(); break;
  }
}
function cardMic(id, btn){
  const it = BY_ID[id], fb = $('#fb-' + id);
  const set = (msg, cls) => { if (fb){ fb.textContent = msg; fb.className = 'feedback ' + (cls || ''); } };
  if (activeRec && activeRec.btn === btn){ activeRec.stop(); return; }   // segundo toque: terminar
  const done = () => btn.classList.remove('listening');
  btn.classList.add('listening');
  const rec = listen(alts => {
    done();
    const ev = evaluateSpeech(alts, it);
    if (fb){ fb.innerHTML = speechFeedbackHTML(ev, {override: 'override', id}); fb.className = 'feedback ' + (ev.ok ? 'ok' : 'bad'); }
    if (ev.ok){ addXP(2); bumpMastery(id); }
  }, msg => { done(); set(msg, msg ? 'bad' : ''); },
  (st, heard) => set(heard ? '👂 «' + heard + '»' : MIC_MSG[st] + (st === 'ready' ? ' (toca 🎤 otra vez al terminar)' : '')));
  if (rec) rec.btn = btn; else done();
}

function bind(){
  document.addEventListener('click', onClick);
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeSheet(); });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.task){
      prog[t.dataset.task] = t.checked; save.prog();
      const name = t.parentElement.querySelector('.task-name'); if (name) name.classList.toggle('done', t.checked);
      if (t.checked) addXP(1);
      renderProgress();
    } else if (t.dataset.set){
      settings[t.dataset.set] = t.checked; save.settings(); applyDisplay();
    } else if (t.id === 'voiceSel'){
      store.setRaw(K.voice, t.value); speak(ALL[0].t);
    }
  });
  let st = null;
  $('#search').addEventListener('input', e => { clearTimeout(st); const v = e.target.value; st = setTimeout(() => renderSearch(v), 120); });
  $('#searchClear').addEventListener('click', () => { $('#search').value = ''; renderSearch(''); $('#search').focus(); });
  document.addEventListener('keydown', e => {
    if (!$('#overlay').classList.contains('open')) return;
    if (e.key === 'Escape'){ closeSheet(); return; }
    const typing = e.target.tagName === 'INPUT' && e.key !== 'Enter';
    if (sheetKeys && !typing && !e.metaKey && !e.ctrlKey && !e.altKey){
      if (e.key === ' ' && e.target.tagName === 'BUTTON' && $('#sheet').contains(e.target)) return;
      const before = sheetKeys; sheetKeys(e.key);
      if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
      void before;
    }
  });
}

/* ---------------- Arranque ---------------- */
function init(){
  shell();
  initTheme(); applyDisplay();
  bind();
  const saved = store.raw(K.phase);
  let idx = PHASES.findIndex(p => p.key === saved);
  if (idx < 0) idx = Object.keys(prog).some(k => prog[k]) ? PHASES.findIndex(p => p.key === '0') : 0;
  const hash = (location.hash.match(/p=([\w-]+)/) || [])[1];
  if (hash){ const h = PHASES.findIndex(p => p.key === hash); if (h >= 0) idx = h; }
  renderPhase(Math.max(0, idx));
  renderProgress();
  ensureVoices();
  if (L.code === 'zh' && !window.pinyinPro){ const sc = document.createElement('script'); sc.src = 'assets/vendor/pinyin-pro.js'; sc.async = true; document.head.appendChild(sc); }
}
init();
})();
