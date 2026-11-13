import { SPOTS, VARIABLES } from './config.js';
import { loadAll, loadStormglass, localHourString, getStormglassKey, setStormglassKey } from './sources.js';
import { buildSeries } from './analysis.js';
import { AGREEMENT_LABEL, describe, dirName, windName, windText } from './compare.js';
import {
  combined, bestWindow, rankSpots, calmestSpot, dayRain, sunTimes, weekOutlook,
  windWord, waveWord, rainWord, aboveFlatCm, groupNotes, trendNote,
} from './advisor.js';
import { spearFish, boatFishing } from './fish.js';

// Her yayında artırılır. Ekranın altında görünür; çalışan KODUN sürümünü gösterir.
const VERSION = 11;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 1) => (v == null ? '–' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const cap = (s) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (t) => t.slice(11, 16);
const endOf = (t) => `${t.slice(11, 13)}:59`;
const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const stored = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const store = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* depolama kapalı */ }
};

const state = {
  store: {}, // Open-Meteo modelleri
  sg: null, // Stormglass (seçili konum)
  series: {}, // konum → saatlik seri
  spotId: stored('adp:spot', SPOTS[0].id),
  day: null,
  time: null, // üstte seçilen saat; bütün ana bölümler buna göre çalışır
  from: 6, // "Saat aralığı raporu" bölümünün kendi seçimi (başlangıç ve bitiş dahil)
  to: 10,
  loading: false,
};

const spot = () => SPOTS.find((s) => s.id === state.spotId) ?? SPOTS[0];
const today = () => localHourString().slice(0, 10);
const cur = () => state.series[state.spotId];

function fullStore(forSpotId) {
  // Stormglass yalnızca çekildiği konum için karşılaştırmaya girer.
  if (state.sg && state.sg.forSpot === forSpotId) return { ...state.store, stormglass: state.sg };
  return state.store;
}

function rebuildSeries() {
  state.series = {};
  for (const s of SPOTS) state.series[s.id] = buildSeries(fullStore(s.id), s);
}

// "Cumartesi", "Bugün, Cumartesi"
function dayOnly(day) {
  const d = new Date(day + 'T00:00:00Z');
  const diff = Math.round((d - new Date(today() + 'T00:00:00Z')) / 86400000);
  const name = DAY_NAMES[d.getUTCDay()];
  return diff === 0 ? `Bugün, ${name}` : diff === 1 ? `Yarın, ${name}` : name;
}
const dateText = (day) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
const dayLabel = (day) => `${dayOnly(day)} · ${dateText(day)}`;

function availableDays() {
  return [...new Set(cur().times.map((t) => t.slice(0, 10)))].filter((d) => d >= today());
}

// İlk açılışta: bugün için şimdiki saat, aralık raporu için şimdiden sonraki 4 saat.
function defaultTimes() {
  const now = Number(localHourString().slice(11, 13));
  const hr = state.day === today() ? now : 9;
  state.time = `${state.day}T${pad(hr)}:00`;
  state.from = state.day === today() ? now : 6;
  state.to = Math.min(23, state.from + 4);
}

// Tarih değişince seçili saat aynı kalır, yalnızca günü değişir.
function keepTimeOnDay() {
  if (!state.time) state.time = `${state.day}T09:00`;
  else if (!state.time.startsWith(state.day)) state.time = `${state.day}T${state.time.slice(11, 13)}:00`;
}

const TONE = { both: 'green', one: 'amber', none: 'red', unknown: 'grey' };
const badge = (text, tone) => `<span class="badge t-${tone}">${esc(text)}</span>`;
const stat = (label, value, sub) => `<div class="stat"><dt>${esc(label)}</dt><dd>${esc(value)}${sub ? `<small>${esc(sub)}</small>` : ''}</dd></div>`;
const list = (items, cls = 'reasons') => (items.length ? `<ul class="${cls}">${items.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '');

// Bir değerin aralık içindeki en düşük ve en yükseği.
function span(hours, get) {
  const vals = hours.map(get).filter((v) => v != null);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), mean: vals.reduce((a, b) => a + b, 0) / vals.length };
}
const spanStr = (sp, fmt, unit) => (fmt(sp.min) === fmt(sp.max) ? `${fmt(sp.max)} ${unit}` : `${fmt(sp.min)}–${fmt(sp.max)} ${unit}`);

// Seçili günün [from, to] saatleri için hesaplanmış her şey; veri yoksa null.
// from === to ise tek saatlik rapordur (üstte seçilen saat).
function context(from, to) {
  const s = cur();
  const items = [];
  s.hours.forEach((h, i) => {
    if (!h.time.startsWith(state.day)) return;
    const hr = Number(h.time.slice(11, 13));
    if (hr < from || hr > to) return;
    items.push({ i, h, c: combined(s, i, spot()) });
  });
  if (!items.length) return null;
  const single = from === to;
  const hours = items.map((x) => x.h);
  const peakWindAt = hours.reduce((a, h) => ((h.dv.wind_speed_10m ?? -1) > (a.dv.wind_speed_10m ?? -1) ? h : a), hours[0]);
  return {
    from, to, single, items, hours, peakWindAt,
    label: single ? `${pad(from)}:00` : `${pad(from)}:00–${pad(to)}:59`,
    range: single ? null : [from, to],
    focus: items[0],
    mid: items[Math.floor(items.length / 2)],
    wave: span(hours, (h) => h.dv.wave_height),
    local: span(hours, (h) => h.localWave),
    wind: span(hours, (h) => h.dv.wind_speed_10m),
    gust: span(hours, (h) => h.dv.wind_gusts_10m),
    cur: span(hours, (h) => h.dv.ocean_current_velocity),
    sst: span(hours, (h) => h.dv.sea_surface_temperature),
    vis: span(hours, (h) => h.dv.visibility),
    rain: span(items.filter((x) => x.c.dive.rain.known), (x) => x.c.dive.rain.mm),
    rainTotal: items.reduce((a, x) => a + (x.c.dive.rain.mm ?? 0), 0),
    rainHours: items.filter((x) => (x.c.dive.rain.mm ?? 0) >= 0.1).length,
    thunder: items.some((x) => x.c.dive.rain.thunder),
  };
}

// Tek saatte notlar olduğu gibi, aralıkta saatleriyle birlikte yazılır.
const notesFor = (ctx, pick) => (ctx.single ? pick(ctx.items[0].c)
  : groupNotes(ctx.items.map((x) => ({ time: x.h.time, notes: pick(x.c) }))));

// ---------- sözle anlatım ----------

function windPhrase(ctx) {
  if (!ctx.wind) return 'Rüzgâr verisi yok';
  const w = windWord(ctx.wind.max).word;
  return ctx.wind.max < 6 ? cap(w) : `${cap(w)}, ${windName(ctx.peakWindAt.dv.wind_direction_10m)}`;
}

// "hafif dalgalı, 25 cm" (düz deniz hizasından)
function wavePhrase(sp) {
  if (!sp) return 'Dalga verisi yok';
  return `${cap(waveWord(sp.max).word)}, ${spanStr(sp, (v) => String(aboveFlatCm(v)), 'cm')}`;
}

function rainPhrase(ctx) {
  if (!ctx.rain) return 'Yağış verisi yok';
  let text = cap(rainWord(ctx.rain.max).word);
  if (ctx.rain.max >= 0.1 && !ctx.single) text += ctx.rainHours <= 1 ? ', kısa sürer' : `, ${ctx.rainHours} saat`;
  if (ctx.thunder) text += ', gök gürültülü';
  return text;
}

// Aralık içinde kötüleşen koşullar için saatli uyarılar.
function trends(ctx, forDive) {
  const out = [];
  if (ctx.single) return out;
  const waveGet = forDive ? (h) => h.localWave : (h) => h.dv.wave_height;
  const where = forDive ? 'Koy içinde dalga' : 'Açıkta dalga';
  const t1 = trendNote(ctx.hours, waveGet, waveWord, (first, peak) => `Saat ${hhmm(first.time)}'dan itibaren ${where.toLocaleLowerCase('tr-TR')} artıyor: ${waveWord(waveGet(peak)).word}, düz denizden ${aboveFlatCm(waveGet(peak))} cm (en yüksek ${hhmm(peak.time)}). Dikkatli ol.`);
  if (t1) out.push(t1);
  const t2 = trendNote(ctx.hours, (h) => h.dv.wind_speed_10m, windWord, (first, peak) => `Saat ${hhmm(first.time)}'dan itibaren rüzgâr artıyor: ${windWord(peak.dv.wind_speed_10m).word}, ${windText(peak.dv.wind_speed_10m, peak.dv.wind_direction_10m)} (en sert ${hhmm(peak.time)}).`);
  if (t2) out.push(t2);
  const t3 = trendNote(ctx.hours, (h) => h.cmp.precipitation.mean ?? null, rainWord, (first, peak) => `Saat ${hhmm(first.time)}'da yağış başlıyor: ${rainWord(peak.cmp.precipitation.mean).word} (en yoğun ${hhmm(peak.time)}).`);
  if (t3) out.push(t3);
  return out;
}

// Zıpkın kararı: tek saat ya da aralık için başlık, renk, notlar ve görüş.
function diveSummary(ctx) {
  const known = ctx.items.filter((x) => x.c.dive.level !== 'unknown');
  const okN = known.filter((x) => diveOk(x.c)).length;
  let tone = 'grey';
  let title = 'Karar verilemiyor';
  if (known.length) {
    if (okN === known.length) { tone = 'green'; title = known.every((x) => x.c.dive.level === 'ideal') ? 'Çok uygun' : 'Uygun'; }
    else if (okN > 0) { tone = 'amber'; title = `${known.length} saatin ${okN} saati uygun`; }
    else if (known.every((x) => x.c.dive.level === 'no')) { tone = 'red'; title = 'Önerilmez'; }
    else { tone = 'amber'; title = 'Sınırda'; }
  }
  const notes = [...notesFor(ctx, (c) => c.dive.notes), ...trends(ctx, true), ...notesFor(ctx, (c) => c.dive.info ?? [])];
  // Görüş: aralıktaki en kötü sınıf
  const visList = ctx.items.map((x) => x.c.dive.vis).filter((v) => v.score != null);
  const vis = visList.length ? visList.reduce((a, v) => (v.score > a.score ? v : a)) : ctx.focus.c.dive.vis;
  return { tone, title, notes, vis };
}

function boatSummary(ctx) {
  const known = ctx.items.filter((x) => x.c.boat.level !== 'unknown');
  const lv = (l) => known.filter((x) => x.c.boat.level === l).length;
  let tone = 'grey';
  let title = 'Karar verilemiyor';
  if (known.length) {
    if (lv('good') === known.length) { tone = 'green'; title = 'Çıkmak mantıklı'; }
    else if (lv('bad') === known.length) { tone = 'red'; title = 'Çıkmak önerilmez'; }
    else if (lv('bad') > 0) { tone = 'amber'; title = `${known.length} saatin ${known.length - lv('bad')} saati uygun`; }
    else { tone = 'amber'; title = 'Çıkılır, dikkatli ol'; }
  }
  const notes = [...notesFor(ctx, (c) => c.boat.notes), ...trends(ctx, false)];
  return { tone, title, notes };
}

// ---------- üst seçim ----------

function renderPicker() {
  $('spot').innerHTML = SPOTS.map((s) => `<option value="${s.id}"${s.id === state.spotId ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  const days = availableDays();
  const date = $('date');
  if (days.length) {
    date.min = days[0];
    date.max = days[days.length - 1];
  }
  date.value = state.day ?? '';
  $('dateDay').textContent = state.day ? `· ${dayOnly(state.day)}` : '';
  const opts = (sel, min) => Array.from({ length: 24 }, (_, h) => h).filter((h) => h >= min)
    .map((h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${pad(h)}:00</option>`).join('');
  $('hour').innerHTML = opts(Number(state.time.slice(11, 13)), 0);
  $('from').innerHTML = opts(state.from, 0);
  $('to').innerHTML = opts(state.to, state.from);
}

function renderAlerts() {
  const all = Object.values(fullStore(state.spotId));
  const failed = all.filter((s) => !s.ok);
  const okCount = Object.values(state.store).filter((s) => s.ok).length;
  const parts = [];
  if (okCount === 0) {
    parts.push('<div class="alert bad"><b>Hiçbir kaynaktan veri alınamadı.</b> İnternet bağlantını kontrol edip “Yenile”ye bas. Bu durumda program yorum üretmez.</div>');
  } else if (failed.length) {
    parts.push(`<div class="alert"><b>${failed.length} kaynak çalışmıyor:</b> ${failed.map((s) => `${esc(s.def.name)} (${esc(s.error)})`).join('; ')}. Diğer kaynaklarla devam ediliyor.</div>`);
  }
  const stale = Object.values(state.store).filter((x) => x.stale);
  if (stale.length) {
    parts.push(`<div class="alert"><b>${stale.length} kaynak şu an yanıt vermiyor</b> (${esc(stale[0].staleReason)}); ${stale.map((x) => esc(x.def.name)).join(', ')} için ${stamp(Math.min(...stale.map((x) => x.fetchedAt)))} tarihli eski veri kullanılıyor.</div>`);
  }
  const groups = { wave: 'dalga', wind: 'rüzgâr ve yağış', ocean: 'akıntı ve su sıcaklığı' };
  for (const [g, label] of Object.entries(groups)) {
    const ok = Object.values(state.store).filter((s) => s.def.group === g && s.ok).length;
    if (okCount > 0 && ok === 0) parts.push(`<div class="alert bad">Hiçbir ${label} kaynağı çalışmıyor; bu değerler gösterilemiyor ve kararlar eksik veriyle veriliyor.</div>`);
    else if (ok === 1 && g !== 'ocean') parts.push(`<div class="alert">Yalnızca bir ${label} kaynağı çalışıyor; karşılaştırma yapılamıyor.</div>`);
  }
  $('alerts').innerHTML = parts.join('');
}

// ---------- genel durum ----------

const diveOk = (c) => c.dive.level === 'ideal' || c.dive.level === 'ok';
const boatOk = (c) => c.boat.level === 'good' || c.boat.level === 'caution';

function renderStatus(ctx) {
  const el = $('status');
  const when = `${esc(spot().name)} · ${esc(dayLabel(state.day))} · ${hhmm(state.time)}`;
  if (!ctx) {
    el.className = 'status';
    el.innerHTML = `<div class="when">${when}</div><div class="title">Bu saat için veri yok</div>
      <div class="line">${Object.values(state.store).some((x) => x.ok)
    ? 'Tahminler en fazla 7 gün sonrasına kadar gelir. Daha yakın bir tarih seç.'
    : 'Kaynaklara ulaşılamadı. Bağlantını kontrol edip “Yenile”ye bas.'}</div>`;
    return;
  }
  const n = ctx.items.length;
  const known = ctx.items.filter((x) => x.c.level !== 'unknown');
  const both = known.filter((x) => x.c.level === 'both').length;
  const nDive = known.filter((x) => diveOk(x.c)).length;
  const nBoat = known.filter((x) => boatOk(x.c)).length;
  let tone = 'red';
  let title = 'Zıpkın ve tekne için uygun değil';
  if (!known.length) { tone = 'grey'; title = 'Karar verilemiyor'; }
  else if (both === n) { tone = 'green'; title = 'Hem zıpkın hem tekne için uygun'; }
  else if (both > 0) { tone = 'amber'; title = `Kısmen uygun: ${n} saatin ${both} saati ikisi için de uygun`; }
  else if (nBoat > 0 && nDive === 0) { tone = 'amber'; title = nBoat === n ? 'Yalnız tekne için uygun' : `Yalnız tekne için, ${n} saatin ${nBoat} saatinde uygun`; }
  else if (nDive > 0 && nBoat === 0) { tone = 'amber'; title = nDive === n ? 'Yalnız zıpkın için uygun' : `Yalnız zıpkın için, ${n} saatin ${nDive} saatinde uygun`; }
  else if (nDive > 0 || nBoat > 0) { tone = 'amber'; title = 'Kısmen uygun; saate göre değişiyor'; }

  const bits = [`Rüzgâr: ${windPhrase(ctx).toLocaleLowerCase('tr-TR')}`, `Dalga: ${wavePhrase(ctx.wave).toLocaleLowerCase('tr-TR')}`, rainPhrase(ctx)];
  if (ctx.sst) bits.push(`Su ${num(ctx.sst.mean, 0)} °C`);

  const blocks = [];
  const c = ctx.focus.c;
  const diveNotes = diveOk(c) ? [] : c.dive.notes;
  const boatNotes = c.boat.level === 'good' ? [] : c.boat.notes;
  if (diveNotes.length) blocks.push([`Zıpkın neden ${c.dive.level === 'marginal' ? 'sınırda' : 'önerilmiyor'}`, diveNotes]);
  if (boatNotes.length) blocks.push([`Tekne neden ${c.boat.level === 'bad' ? 'önerilmiyor' : 'dikkat istiyor'}`, boatNotes]);
  if (c.dive.daylight === false) bits.push('Gece, fener gerekir');

  el.className = `status t-${tone}`;
  el.innerHTML = `<div class="when">${when}</div><div class="title">${esc(title)}</div>
    <div class="line">${esc(bits.join(' · '))}</div>
    ${blocks.map(([t, notes]) => `<div class="why"><b>${esc(t)}</b>${list(notes, '')}</div>`).join('')}`;
}

// ---------- saatler ----------

function renderHours() {
  const s = cur();
  const now = localHourString();
  const short = { 'İkisi de': 'İkisi de', 'Yalnız tekne': 'Tekne', 'Yalnız zıpkın': 'Zıpkın', 'Uygun değil': 'Uygun değil', 'Veri yok': 'Veri yok' };
  $('dayName').textContent = dayLabel(state.day);
  const sun = sunTimes(s, state.day);
  $('sun').textContent = sun ? `Gün doğumu ${sun.rise} · Gün batımı ${sun.set}` : '';
  const out = [];
  s.hours.forEach((h, i) => {
    if (!h.time.startsWith(state.day)) return;
    const c = combined(s, i, spot());
    out.push(`<button type="button" class="hour ${c.level}${h.time < now ? ' past' : ''}" data-time="${h.time}"
      aria-pressed="${h.time === state.time}" title="${esc(c.label)}"><b>${h.time.slice(11, 13)}</b><span>${short[c.label]}</span></button>`);
  });
  $('hours').innerHTML = out.join('') || '<p class="muted">Bu gün için veri yok.</p>';
}

// ---------- saat aralığı raporu (kendi seçimi var; üstteki saati değiştirmez) ----------

function renderRange(r) {
  const el = $('rangeOut');
  if (!r) {
    el.innerHTML = '<p class="lead">Bu aralık için veri yok.</p>';
    return;
  }
  const d = diveSummary(r);
  const b = boatSummary(r);
  const minT = state.day === today() ? localHourString() : null;
  const best = r.items.length >= 3 ? bestWindow(cur(), spot(), state.day, minT, [r.from, r.to]) : null;
  const low = (t) => t.toLocaleLowerCase('tr-TR');
  const wind = r.wind ? `${low(windPhrase(r))} (${spanStr(r.wind, (v) => num(v, 0), 'km/sa')})` : 'veri yok';
  const cm = (sp) => spanStr(sp, (v) => String(aboveFlatCm(v)), 'cm');
  const diveLine = [
    `Görüş ${low(d.vis.label)}${d.vis.range ? ` (${d.vis.range})` : ''}`,
    r.local ? `koy içi dalga ${waveWord(r.local.max).word} (düz denizden ${cm(r.local)})` : 'dalga verisi yok',
    `rüzgâr ${wind}`,
    !r.cur ? 'akıntı verisi yok' : r.cur.max < 0.15 ? 'akıntı yok denecek kadar az' : `akıntı ${r.cur.max < 0.5 ? 'hafif' : r.cur.max < 0.8 ? 'orta' : 'kuvvetli'} (${num(r.cur.max)} kn)`,
    `yağış: ${low(rainPhrase(r))}`,
  ].join(', ');
  const boatLine = [
    r.wave ? `Açıkta dalga ${waveWord(r.wave.max).word} (düz denizden ${cm(r.wave)})` : 'Dalga verisi yok',
    `rüzgâr ${wind}`,
    r.gust ? `hamle en çok ${num(r.gust.max, 0)} km/sa` : 'hamle verisi yok',
    `yağış: ${low(rainPhrase(r))}`,
  ].join(', ');
  const block = (name, sum, line, extra) => `<div class="rblock">
    <div class="head"><h3>${name} · ${r.label}</h3>${badge(sum.title, sum.tone)}</div>
    <p class="lead">${esc(line)}.</p>
    ${sum.notes.length ? list(sum.notes) : '<p class="note">Bu aralıkta dikkat gerektiren bir şey görünmüyor.</p>'}
    ${extra}</div>`;
  el.innerHTML = block('Zıpkın', d, diveLine,
    best && best.level !== 'no' ? `<p class="note">Bu aralıktaki en iyi 3 saat: ${hhmm(best.from)}–${endOf(best.to)}${best.night ? ' (gece)' : ''}.</p>` : '')
    + block('Tekne', b, boatLine, '');
}

// ---------- dalga görüntüsü ----------

function renderWave(ctx) {
  const el = $('wave');
  const h = ctx?.focus.h;
  if (!h || h.dv.wave_height == null) {
    el.innerHTML = '<div class="head"><h2>Dalga görüntüsü</h2></div><p class="lead">Bu saat için dalga verisi yok.</p>';
    return;
  }
  const hs = h.dv.wave_height;
  const period = h.dv.wave_period ?? 4;
  const amp = aboveFlatCm(hs); // cm, düz deniz hizasından
  const localAmp = aboveFlatCm(h.localWave);
  const lengthM = 1.56 * period * period; // derin su dalga boyu
  const W = 640;
  const H = 210;
  const base = 112;
  const pxPerM = 12; // yatay ölçek: 10 m tekne = 120 px
  const pxPerCm = Math.min(1, 62 / Math.max(amp, 1)); // dikey ölçek; çok yüksek dalgada sığdır
  const A = Math.max(1.5, amp * pxPerCm);
  const Lpx = Math.max(60, lengthM * pxPerM);
  const y = (x, a) => base - a * Math.sin((2 * Math.PI * (x - 40)) / Lpx);
  const path = (a) => Array.from({ length: W / 4 + 1 }, (_, k) => `${k === 0 ? 'M' : 'L'}${k * 4},${y(k * 4, a).toFixed(1)}`).join(' ');
  const surf = path(A);
  // 10 m'lik tekne, dalganın üstünde ve eğimine göre yatık
  const bx = 400;
  const tilt = (Math.atan2(y(bx + 60, A) - y(bx - 60, A), 120) * 180) / Math.PI;
  const by = (y(bx - 60, A) + y(bx + 60, A)) / 2;
  const crestX = 40 + Lpx / 4;
  const showLocal = localAmp != null && Math.abs(localAmp - amp) >= 3;
  const word = waveWord(hs).word;

  el.innerHTML = `
    <div class="head"><h2>Dalga görüntüsü <span class="muted">${hhmm(h.time)}</span></h2>${badge(cap(word), hs < 0.6 ? 'green' : hs < 1.5 ? 'amber' : 'red')}</div>
    <svg class="wavepic" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saat ${hhmm(h.time)} için tahmini dalga şekli: düz denizden ${amp} santimetre">
      <path d="${surf} L${W},${H} L0,${H} Z" class="sea"/>
      <path d="${surf}" class="crest"/>
      ${showLocal ? `<path d="${path(Math.max(1, localAmp * pxPerCm))}" class="bay"/>` : ''}
      <line x1="0" y1="${base}" x2="${W}" y2="${base}" class="flat"/>
      <text x="${W - 6}" y="${base - 5}" text-anchor="end" class="lbl">düz deniz hizası</text>
      <line x1="${crestX}" y1="${base}" x2="${crestX}" y2="${base - A}" class="mark"/>
      <text x="${crestX + 7}" y="${Math.max(14, base - A - 6)}" class="val">+${amp} cm</text>
      <g transform="translate(${bx},${by.toFixed(1)}) rotate(${tilt.toFixed(1)})">
        <path d="M-60,-2 L60,-2 L48,12 L-52,12 Z" class="hull"/>
        <path d="M-26,-2 L-20,-16 L16,-16 L24,-2 Z" class="cabin"/>
      </g>
      <text x="${bx}" y="${H - 8}" text-anchor="middle" class="lbl">10 m tekne</text>
    </svg>
    <p class="lead">Düz deniz hizasından yaklaşık <b>${amp} cm</b> yükselip ${amp} cm alçalır (tepeden çukura ${amp * 2} cm). Dalgalar ${dirName(h.dv.wave_direction)} yönünden, yaklaşık ${num(period, 0)} saniyede bir, ${num(lengthM, 0)} m arayla gelir.${localAmp != null ? ` Koy içinde: ${showLocal ? `yaklaşık ${localAmp} cm (kesikli çizgi)` : 'açıktakiyle aynı'}.` : ''}</p>
    <p class="note">Çizim tahmindir. Yükseklik görünür olsun diye dikey ölçek büyütülmüştür${pxPerCm < 1 ? ' ve dalga yüksek olduğu için sığdırılmıştır' : ''}; tekne yalnızca dalga aralığını kıyaslamak içindir. Tek tük dalgalar bu ortalamanın iki katına çıkabilir.</p>`;
}

// ---------- haftaya bakış (yalnızca bilgi; seçimi değiştirmez) ----------

function renderWeek() {
  const days = availableDays();
  const w = weekOutlook(cur(), spot(), days, localHourString());
  // Cümle içinde gün adı: "bugün", "yarın", "Salı"; bugünle aynı ada denk gelen gün tarihle ayrılır.
  const todayName = dayOnly(today()).replace('Bugün, ', '');
  const names = (arr) => arr.map((d) => {
    if (d.day === today()) return 'bugün';
    const n = dayOnly(d.day);
    if (n.startsWith('Yarın')) return 'yarın';
    return n === todayName ? `${n} (${dateText(d.day)})` : n;
  });
  let lead;
  if (w.days.every((d) => d.level === 'unknown')) lead = 'Haftalık değerlendirme için veri yok.';
  else if (!w.top) {
    const one = w.days.filter((d) => d.level === 'one');
    lead = one.length ? `Bu hafta zıpkın ve tekne için birlikte uygun gün görünmüyor. Kısmen uygun günler: ${names(one).join(', ')}.`
      : 'Bu hafta uygun gün görünmüyor.';
  } else {
    const others = w.good.filter((d) => d !== w.top);
    lead = `En iyi gün ${names([w.top])[0]}: ${w.top.counts.both} saat hem zıpkın hem tekne için uygun.`
      + (others.length ? ` Diğer iyi günler: ${names(others).join(', ')}.` : '');
  }
  const rainText = (r) => (!r.known ? 'veri yok' : r.total < 0.1 ? 'yok' : `${rainWord(r.peak.mm).word}${r.thunder ? ', fırtına' : ''}`);
  $('weekSpot').textContent = spot().name;
  $('week').innerHTML = `
    <p class="lead">${esc(lead)}</p>
    <div class="scroll"><table class="week">
      <thead><tr><th>Gün</th><th>Durum</th><th>Uygun saat</th><th>En iyi aralık</th><th>Dalga (en yüksek)</th><th>Rüzgâr (en sert)</th><th>Yağış</th></tr></thead>
      <tbody>${w.days.map((d) => `<tr${d.day === state.day ? ' class="selected"' : ''}>
        <td>${esc(dayOnly(d.day))}<br><span class="muted">${dateText(d.day)}</span></td>
        <td><span class="badge t-${TONE[d.level]}">${esc(d.label)}</span></td>
        <td>${d.level === 'unknown' ? '–' : `${d.counts.both} ikisi${d.counts.tekne ? ` · ${d.counts.tekne} tekne` : ''}${d.counts.zipkin ? ` · ${d.counts.zipkin} zıpkın` : ''}`}</td>
        <td>${d.best && d.best.level !== 'no' ? `${hhmm(d.best.from)}–${endOf(d.best.to)}${d.best.night ? ' (gece)' : ''}` : '–'}</td>
        <td>${d.maxWave == null ? '–' : `${esc(waveWord(d.maxWave).word)}<br><span class="muted">${aboveFlatCm(d.maxWave)} cm</span>`}</td>
        <td>${d.maxWind == null ? '–' : `${esc(windWord(d.maxWind).word)}<br><span class="muted">${num(d.maxWind, 0)} km/sa</span>`}</td>
        <td>${esc(rainText(d.rain))}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="note">Yalnızca bilgi içindir; seçtiğin tarih ve saatleri değiştirmez. Uzak günlerde tahmin daha belirsizdir ve bazı modeller 5 günden sonrasını vermez.</p>`;
}

// ---------- zıpkın ----------

function renderDive(ctx) {
  const el = $('dive');
  if (!ctx) {
    el.innerHTML = '<div class="head"><h2>Zıpkın</h2></div><p class="lead">Bu saat için veri yok.</p>';
    return;
  }
  const sp = spot();
  const s = cur();
  const { tone, title, notes, vis } = diveSummary(ctx);
  const minT = state.day === today() ? localHourString() : null;
  const best = bestWindow(s, sp, state.day, minT);
  const ranking = rankSpots(state.series, SPOTS, state.day, minT).filter((r) => r.best).slice(0, 3);
  const fish = spearFish(s, ctx.focus.i, sp);
  const bestText = !best ? (state.day === today() ? 'Bugün için saat kalmadı' : 'Belirlenemiyor')
    : best.level === 'no' ? 'Uygun saat yok' : `${hhmm(best.from)}–${endOf(best.to)}${best.night ? ' (gece)' : ''}`;
  const LVL = { ideal: 'çok uygun', ok: 'uygun', marginal: 'sınırda', no: 'önerilmez' };

  el.innerHTML = `
    <div class="head"><h2>Zıpkın <span class="muted">${ctx.label}</span></h2>${badge(title, tone)}</div>
    ${list(notes)}
    <dl class="stats">
      ${stat('Su altı görüşü', vis.label, vis.range ? `tahmini ${vis.range}` : '')}
      ${stat('Koy içi dalga', ctx.local ? cap(waveWord(ctx.local.max).word) : 'Veri yok', ctx.local ? `düz denizden ${spanStr(ctx.local, (v) => String(aboveFlatCm(v)), 'cm')}` : '')}
      ${stat('Rüzgâr', windPhrase(ctx), ctx.wind ? spanStr(ctx.wind, (v) => num(v, 0), 'km/sa') : '')}
      ${stat('Akıntı', !ctx.cur ? 'Veri yok' : ctx.cur.max < 0.15 ? 'Yok denecek kadar az' : ctx.cur.max < 0.5 ? 'Hafif' : ctx.cur.max < 0.8 ? 'Orta' : 'Kuvvetli', ctx.cur && ctx.cur.max >= 0.15 ? spanStr(ctx.cur, (v) => num(v), 'kn') : '')}
      ${stat('Su sıcaklığı', ctx.sst ? `${num(ctx.sst.mean)} °C` : 'Veri yok')}
      ${stat('Yağış', rainPhrase(ctx), ctx.rain && ctx.rainTotal >= 0.1 ? `${num(ctx.rainTotal)} mm` : '')}
    </dl>
    <p class="note">Görüş: ${esc(vis.notes.join(' '))} Tahmindir, ölçüm değil (güven: ${esc(vis.confidence)}).</p>
    <div class="cols">
      <div>
        <h3>Gün içinde ne zaman, nerede</h3>
        <ul class="rows">
          <li><span>${esc(sp.name)} için en iyi saat</span><span>${esc(bestText)}</span></li>
          ${ranking.map((r, n) => `<li><span>${n + 1}. <button type="button" data-spot="${r.spot.id}">${esc(r.spot.name)}</button></span>
            <span>${hhmm(r.best.from)}–${endOf(r.best.to)}${r.best.night ? ' (gece)' : ''} · ${LVL[r.best.level]}</span></li>`).join('')}
        </ul>
      </div>
      <div>
        <h3>Balık aktivitesi tahmini</h3>
        <ul class="fish">
          ${fish.list.map((f) => `<li><span class="name">${esc(f.name)}<small>${esc(f.depth)}${f.inSeason ? '' : ' · mevsim dışı'}${f.match === 0 ? ' · bu zeminde beklenmez' : ''}</small></span>
            <span class="pct">%${f.pct}</span><span class="bar"><i style="width:${f.pct}%"></i></span>
            <span class="where">${esc(f.where)}</span></li>`).join('')}
        </ul>
        <p class="note">Yüzdeler; bu noktanın zemini, mevsim, su sıcaklığı, akıntı, görüş ve saate göre hesaplanan aktivite tahminidir, tutulan balık istatistiği değildir. Ay: ${esc(fish.moon.name.toLocaleLowerCase('tr-TR'))}.${fish.sstKnown ? '' : ' Su sıcaklığı verisi olmadığı için daha belirsiz.'}</p>
      </div>
    </div>`;
}

// ---------- tekne ----------

function renderBoat(ctx) {
  const el = $('boat');
  if (!ctx) {
    el.innerHTML = '<div class="head"><h2>Tekne</h2></div><p class="lead">Bu saat için veri yok.</p>';
    return;
  }
  const { tone, title, notes } = boatSummary(ctx);
  const calm = calmestSpot(state.series, SPOTS, ctx.mid.h.time);
  const methods = boatFishing(cur(), ctx.mid.i);
  const peakWave = ctx.hours.reduce((a, h) => ((h.dv.wave_height ?? -1) > (a.dv.wave_height ?? -1) ? h : a), ctx.hours[0]);
  el.innerHTML = `
    <div class="head"><h2>Tekne <span class="muted">${ctx.label}</span></h2>${badge(title, tone)}</div>
    ${list(notes)}
    <dl class="stats">
      ${stat('Açık denizde dalga', ctx.wave ? cap(waveWord(ctx.wave.max).word) : 'Veri yok', ctx.wave ? `düz denizden ${spanStr(ctx.wave, (v) => String(aboveFlatCm(v)), 'cm')}, ${dirName(peakWave.dv.wave_direction)} yönünden` : '')}
      ${stat('Rüzgâr', windPhrase(ctx), ctx.wind ? spanStr(ctx.wind, (v) => num(v, 0), 'km/sa') : '')}
      ${stat('Hamle', ctx.gust ? cap(windWord(ctx.gust.max).word.replace('eser', 'vurur').replace('esmez', 'yok')) : 'Veri yok', ctx.gust ? `en çok ${num(ctx.gust.max, 0)} km/sa` : '')}
      ${stat('Yağış', rainPhrase(ctx), ctx.rain && ctx.rainTotal >= 0.1 ? `${num(ctx.rainTotal)} mm` : '')}
      ${stat('Hava görüşü', !ctx.vis ? 'Veri yok' : ctx.vis.min >= 10 ? 'Açık' : ctx.vis.min >= 4 ? 'Puslu' : 'Kısıtlı', ctx.vis ? `en az ${num(ctx.vis.min, 0)} km` : '')}
      ${stat('En sakin bölge', calm ? calm.spot.name : 'Veri yok', calm ? `${waveWord(calm.wave).word}, ${aboveFlatCm(calm.wave)} cm` : '')}
    </dl>
    <h3>Av önerileri</h3>
    <div class="scroll"><table class="methods">
      <thead><tr><th>Yöntem</th><th class="wrap">Nerede, kaç metrede</th><th class="wrap">Gelebilecek balık</th><th class="wrap">Yem ya da jig</th><th>Durum</th></tr></thead>
      <tbody>${methods.map((m) => `<tr class="${m.status === 'off' ? 'dim' : ''}">
        <td>${esc(m.name)}</td>
        <td class="wrap">${esc(m.depth)}<small class="muted"> · ${esc(m.where)}</small></td>
        <td class="wrap">${m.targets.length ? esc(m.targets.join(', ')) : '–'}</td>
        <td class="wrap">${esc(m.lure)}</td>
        <td><span class="pill ${m.status}">${esc(m.statusText)}</span></td></tr>`).join('')}</tbody>
    </table></div>
    <p class="note">Öneriler mevsime ve bu saatin dalga, rüzgâr, akıntı ve ışık durumuna göre seçilir. Derinlik ve yem bilgileri genel amatör balıkçılık bilgisidir.</p>`;
}

// ---------- yağış ----------

function renderRain(ctx) {
  const day = dayRain(cur(), state.day);
  const f = ctx?.focus.c.dive.rain;
  let tone = 'grey';
  let lead = 'Bu saat için yağış verisi yok.';
  if (f?.known) {
    const mm = f.mm;
    tone = f.thunder || mm >= 4 ? 'red' : mm >= 0.1 ? 'amber' : 'green';
    const how = mm < 0.1 ? 'yağış beklenmiyor.' : mm < 0.5 ? 'çiseleme şeklinde, ıslatmayacak kadar az yağar.' : mm < 1 ? 'hafif yağar, işini engellemez.'
      : mm < 4 ? 'orta şiddette yağar; ıslanırsın, görüş biraz düşer.' : mm < 10 ? 'kuvvetli yağar; görüş belirgin düşer.' : 'sağanak var; kısa sürede çok su iner, görüş çok düşer.';
    lead = `Saat ${hhmm(state.time)}'da ${how}`;
    if (mm >= 0.1) {
      // Yağışın bu saatin çevresinde kaç saat sürdüğü
      const k = day.hours.findIndex((x) => x.time === state.time);
      let a = k;
      let b = k;
      while (a > 0 && (day.hours[a - 1].mm ?? 0) >= 0.1) a--;
      while (b < day.hours.length - 1 && (day.hours[b + 1].mm ?? 0) >= 0.1) b++;
      lead += b === a ? ' Kısa sürer, bir saat içinde geçer.' : ` ${hhmm(day.hours[a].time)}–${endOf(day.hours[b].time)} arası ${b - a + 1} saat sürer.`;
    }
    if (f.thunder) lead += ' Gök gürültülü fırtına riski var.';
  }
  $('rain').innerHTML = `
    <div class="head"><h2>Yağış <span class="muted">${ctx ? ctx.label : ''}</span></h2>${badge(f?.known ? cap(rainWord(f.mm).word) : 'Veri yok', tone)}</div>
    <p class="lead">${esc(lead)}</p>
    ${f?.known ? `<dl class="stats">
      ${stat(`Saat ${hhmm(state.time)}`, f.mm < 0.1 ? 'Yağış yok' : `${num(f.mm)} mm`, f.max >= 0.1 ? `en yüksek tahmin ${num(f.max)} mm` : '')}
      ${stat('Günün tamamı', day.known ? (day.total < 0.1 ? 'Yağış yok' : `${num(day.total)} mm`) : 'Veri yok', day.known && day.total >= 0.1 ? `${day.wetHours} saat yağışlı` : '')}
      ${stat('Kaynak uyumu', `${f.wet}/${f.models} model`, 'bu saatte yağış gösteriyor')}
    </dl>` : ''}
    <p class="note">Gün geneli: ${esc(day.text)}</p>`;

  $('rainDay').textContent = dayLabel(state.day);
  if (!day.known) {
    $('rainChart').innerHTML = '';
    return;
  }
  const top = Math.max(2, ...day.hours.map((x) => x.mm ?? 0));
  $('rainChart').innerHTML = day.hours.map((x) => {
    const mm = x.mm ?? 0;
    const hr = Number(x.time.slice(11, 13));
    const heavy = x.thunder || mm >= 4;
    return `<div class="col${x.time === state.time ? ' sel' : ''}" title="${pad(hr)}:00 – ${x.known ? `${num(mm)} mm, ${esc(x.label)}` : 'veri yok'}">
      <span class="mm">${mm >= 0.1 ? num(mm) : ''}</span>
      <span class="bar${mm < 0.1 ? ' zero' : heavy ? ' heavy' : ''}" style="height:${mm < 0.1 ? 2 : Math.max(4, (mm / top) * 100)}px"></span>
      <span class="hr">${hr % 3 === 0 || x.time === state.time ? pad(hr) : ''}</span></div>`;
  }).join('');
}

// ---------- ayrıntılar ----------

function fmtValue(v, value) {
  if (value == null) return '–';
  if (v.circular) return v.key.startsWith('wind') ? windName(value) : dirName(value);
  return num(value, v.digits ?? 1);
}

function renderComparison(ctx) {
  if (!ctx) {
    $('cmp').innerHTML = '';
    $('summary').innerHTML = '';
    $('cmpWhen').textContent = '';
    return;
  }
  const h = ctx.focus.h;
  $('cmpWhen').textContent = hhmm(h.time);
  const sources = Object.values(fullStore(state.spotId));
  const key = ['wave_height', 'wind_speed_10m', 'wind_gusts_10m', 'precipitation'];
  $('summary').innerHTML = VARIABLES.filter((v) => key.includes(v.key))
    .map((v) => `<p class="ag-${h.cmp[v.key].agreement}">${esc(describe(v, h.cmp[v.key]))}</p>`).join('');

  const head = `<thead><tr><th>Değer</th>${sources.map((src) => `<th>${esc(src.def.name)}<small>~${src.def.resKm} km</small></th>`).join('')}
    <th>En düşük</th><th>En yüksek</th><th>Ortalama</th><th>Ağ. ort.</th><th>Fark</th><th>Uyum</th></tr></thead>`;
  const rows = VARIABLES.map((v) => {
    const c = h.cmp[v.key];
    const byId = Object.fromEntries(h.entries[v.key].map((e) => [e.id, e]));
    const cells = sources.map((src) => {
      const e = byId[src.def.id];
      if (!e) return '<td class="muted">–</td>';
      if (e.failed) return '<td><span class="pill fail">hata</span></td>';
      return `<td>${fmtValue(v, e.value)}</td>`;
    }).join('');
    let calc;
    if (c.count === 0) calc = '<td>–</td><td>–</td><td>–</td><td>–</td><td>–</td>';
    else if (v.circular) calc = `<td>–</td><td>–</td><td><strong>${fmtValue(v, c.mean)}</strong></td><td><strong>${fmtValue(v, c.wmean)}</strong></td><td>${c.count > 1 ? Math.round(c.spread) + '°' : '–'}</td>`;
    else calc = `<td>${fmtValue(v, c.min)}</td><td>${fmtValue(v, c.max)}</td><td><strong>${fmtValue(v, c.mean)}</strong></td><td><strong>${fmtValue(v, c.wmean)}</strong></td><td>${c.count > 1 ? fmtValue(v, c.spread) : '–'}</td>`;
    return `<tr><td>${esc(v.label)} <span class="muted">${v.circular ? '' : esc(v.unit)}</span></td>${cells}${calc}
      <td><span class="pill ${c.agreement}">${AGREEMENT_LABEL[c.agreement]}${c.count > 1 ? ` · ${c.count}` : ''}</span></td></tr>`;
  }).join('');
  $('cmp').innerHTML = `${head}<tbody>${rows}</tbody>`;
}

function renderRanking() {
  const minT = state.day === today() ? localHourString() : null;
  const ranking = rankSpots(state.series, SPOTS, state.day, minT);
  const LVL = { ideal: 'Çok uygun', ok: 'Uygun', marginal: 'Sınırda', no: 'Önerilmez' };
  const rows = ranking.map((r, n) => {
    if (!r.best) return `<tr><td>${n + 1}. ${esc(r.spot.name)}</td><td colspan="5" class="wrap muted">veri yok</td></tr>`;
    const h = state.series[r.spot.id].hours[r.best.mid.i];
    const vis = r.best.mid.v.vis;
    return `<tr class="clickable${r.spot.id === state.spotId ? ' selected' : ''}" data-spot="${r.spot.id}">
      <td>${n + 1}. ${esc(r.spot.name)}</td>
      <td><span class="pill ${r.best.level}">${LVL[r.best.level]}</span></td>
      <td>${hhmm(r.best.from)}–${endOf(r.best.to)}${r.best.night ? ' (gece)' : ''}</td>
      <td>${h.localWave == null ? '–' : `${esc(waveWord(h.localWave).word)}, ${aboveFlatCm(h.localWave)} cm`}</td>
      <td>${h.dv.wind_speed_10m == null ? '–' : esc(`${windWord(h.dv.wind_speed_10m).word}, ${windText(h.dv.wind_speed_10m, h.dv.wind_direction_10m)}`)}</td>
      <td><span class="pill ${vis.cls}">${esc(vis.label)}</span></td></tr>`;
  }).join('');
  $('rank').innerHTML = `<thead><tr><th>Koy</th><th>Zıpkın</th><th>En iyi saat</th><th>Koy içi dalga</th><th>Rüzgâr</th><th>Görüş</th></tr></thead><tbody>${rows}</tbody>`;
}

function ago(ms) {
  if (!ms) return 'bilinmiyor';
  const h = (Date.now() - ms) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} dk önce`;
  if (h < 48) return `${Math.round(h)} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

function stamp(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderSources() {
  const GROUP = { wave: 'Dalga', wind: 'Rüzgâr, yağış', ocean: 'Akıntı, sıcaklık, seviye', blend: 'Karma' };
  const all = Object.values(fullStore(state.spotId));
  const rows = all.map((src) => {
    const sd = src.ok ? src.spots[state.spotId] : null;
    const status = src.stale ? `<span class="pill partial">eski veri</span> <span class="muted">${esc(src.staleReason)}</span>`
      : src.ok ? '<span class="pill good">çalışıyor</span>' : `<span class="pill fail">hata</span> <span class="muted">${esc(src.error)}</span>`;
    return `<tr><td>${esc(src.def.name)}<br><span class="muted">${esc(src.def.provider)}</span></td>
      <td>${GROUP[src.def.group]}</td>
      <td>~${src.def.resKm} km</td>
      <td>${status}</td>
      <td>${src.ok ? (src.runTime ? `${stamp(src.runTime)} <span class="muted">(${ago(src.runTime)})</span>` : '<span class="muted">bildirilmiyor</span>') : '–'}</td>
      <td>${src.ok ? stamp(src.fetchedAt) : '–'}</td>
      <td>${sd?.distKm != null ? `${num(sd.distKm)} km` : '–'}</td></tr>`;
  }).join('');
  $('sources').innerHTML = `<thead><tr><th>Kaynak</th><th>Ne veriyor</th><th>Çözünürlük</th><th>Durum</th>
    <th>Model güncellemesi</th><th>Çekildiği an</th><th>Noktaya uzaklık</th></tr></thead><tbody>${rows}</tbody>`;
  $('licenses').innerHTML = [...new Set(all.map((src) => src.def.license))].map((l) => `Lisans: ${esc(l)}.`).join('<br>');
}

// ---------- dalış günlüğü ----------

const visClass = (m) => (m >= 15 ? 'Temiz' : m >= 8 ? 'Orta' : m >= 4 ? 'Bulanık' : 'Çok bulanık');

function readLog() {
  try { return JSON.parse(localStorage.getItem('adp:log') || '[]'); } catch { return []; }
}

function renderLog() {
  const log = readLog();
  if (log.length === 0) {
    $('log').innerHTML = '';
    $('logSummary').textContent = 'Henüz kayıt yok.';
    return;
  }
  const hits = log.filter((e) => e.forecastVis && visClass(e.actualVis) === e.forecastVis).length;
  const waves = log.filter((e) => e.actualWave != null && e.forecastWave != null);
  const bias = waves.length ? waves.reduce((a, e) => a + (e.forecastWave - e.actualWave), 0) / waves.length : null;
  $('logSummary').textContent = `${log.length} kayıt · görüş tahmini ${hits} kez tuttu`
    + (bias != null ? ` · dalga tahmini ortalama ${num(Math.abs(bias))} m ${bias >= 0 ? 'fazla' : 'eksik'}` : '');
  $('log').innerHTML = `<thead><tr><th>Konum, saat</th><th>Tahmin görüş</th><th>Gerçek görüş</th><th>Tahmin dalga</th><th>Gerçek dalga</th><th class="wrap">Not</th></tr></thead><tbody>${
    log.slice(-15).reverse().map((e) => `<tr><td>${esc(e.spotName)}<br><span class="muted">${esc(e.time.replace('T', ' '))}</span></td>
      <td>${esc(e.forecastVis ?? '–')}</td><td>${num(e.actualVis, 0)} m (${visClass(e.actualVis)})</td>
      <td>${num(e.forecastWave)} m</td><td>${e.actualWave != null ? num(e.actualWave) + ' m' : '–'}</td><td class="wrap">${esc(e.note || '')}</td></tr>`).join('')
  }</tbody>`;
}

function saveLog(ev) {
  ev.preventDefault();
  const hr = Number(state.time.slice(11, 13));
  const ctx = context(hr, hr);
  if (!ctx) return;
  const { h, c } = ctx.focus;
  const log = readLog();
  log.push({
    savedAt: Date.now(),
    spotId: state.spotId,
    spotName: spot().name,
    time: h.time,
    actualVis: Number($('logVis').value),
    actualWave: $('logWave').value === '' ? null : Number($('logWave').value),
    note: $('logNote').value.trim(),
    forecastVis: c.dive.vis.cls === 'unknown' ? null : c.dive.vis.label,
    forecastWave: h.localWave,
  });
  store('adp:log', JSON.stringify(log));
  ev.target.reset();
  renderLog();
}

// ---------- akış ----------

function renderAll() {
  keepTimeOnDay();
  const hr = Number(state.time.slice(11, 13));
  const ctx = context(hr, hr); // üstte seçilen tek saat
  renderPicker();
  renderAlerts();
  renderStatus(ctx);
  renderHours();
  renderWave(ctx);
  renderRange(context(state.from, state.to)); // ayrı bölüm, kendi aralığı
  renderWeek();
  renderDive(ctx);
  renderBoat(ctx);
  renderRain(ctx);
  renderComparison(ctx);
  renderRanking();
  renderSources();
  renderLog();
  const fetched = Object.values(state.store).filter((x) => x.ok).map((x) => x.fetchedAt);
  $('updated').textContent = fetched.length ? `Veri çekildi: ${stamp(Math.max(...fetched))}` : 'Veri alınamadı';
}

async function refreshStormglass() {
  const sp = spot();
  const res = await loadStormglass(sp);
  state.sg = res ? { ...res, forSpot: sp.id } : null;
}

async function load(force = false) {
  if (state.loading) return;
  state.loading = true;
  $('refresh').disabled = true;
  $('updated').textContent = 'Kaynaklar çekiliyor…';
  try {
    [state.store] = await Promise.all([loadAll({ force }), refreshStormglass()]);
    rebuildSeries();
    const days = availableDays();
    if (!state.day || !days.includes(state.day)) {
      state.day = days[0] ?? today();
      defaultTimes();
    }
    renderAll();
  } finally {
    state.loading = false;
    $('refresh').disabled = false;
  }
}

async function selectSpot(id) {
  state.spotId = id;
  store('adp:spot', id);
  if (getStormglassKey()) {
    await refreshStormglass();
    rebuildSeries();
  }
  renderAll();
}

$('refresh').addEventListener('click', () => load(true));
$('spot').addEventListener('change', (e) => selectSpot(e.target.value));
$('date').addEventListener('change', (e) => {
  if (!e.target.value) return;
  state.day = e.target.value; // seçili saat ve aralık kullanıcının bıraktığı gibi kalır
  renderAll();
});
$('hour').addEventListener('change', (e) => {
  state.time = `${state.day}T${pad(Number(e.target.value))}:00`;
  renderAll();
});
$('from').addEventListener('change', (e) => {
  state.from = Number(e.target.value);
  if (state.to < state.from) state.to = state.from;
  renderAll();
});
$('to').addEventListener('change', (e) => {
  state.to = Number(e.target.value);
  renderAll();
});
$('hours').addEventListener('click', (e) => {
  const time = e.target.closest('[data-time]')?.dataset.time;
  if (!time) return;
  state.time = time;
  renderAll();
});
document.addEventListener('click', (e) => {
  const id = e.target.closest('[data-spot]')?.dataset.spot;
  if (!id || id === state.spotId) return;
  selectSpot(id).then(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
});
// Haftaya bakış açık/kapalı durumu hatırlanır.
$('weekBox').open = stored('adp:weekOpen', '1') === '1';
$('weekBox').addEventListener('toggle', (e) => store('adp:weekOpen', e.target.open ? '1' : '0'));
$('logForm').addEventListener('submit', saveLog);
$('sgKey').value = getStormglassKey();
$('sgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setStormglassKey($('sgKey').value.trim());
  await refreshStormglass();
  rebuildSeries();
  renderAll();
});

$('version').textContent = `Sürüm ${VERSION}`;
load();

// Yeni sürüm arka planda hazır olunca sayfayı bir kez yenile; kullanıcı eski kodla kalmasın.
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  navigator.serviceWorker.register('sw.js')
    .then((reg) => reg.update())
    .catch(() => { /* çevrimdışı destek yok, uygulama yine çalışır */ });
}
