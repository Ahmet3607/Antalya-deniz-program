import { SPOTS, VARIABLES } from './config.js';
import { loadAll, loadStormglass, localHourString, getStormglassKey, setStormglassKey } from './sources.js';
import { buildSeries } from './analysis.js';
import { AGREEMENT_LABEL, describe, compass } from './compare.js';
import { boatVerdict, diveVerdict, bestWindow, fishActivity, rankSpots, isDaylight } from './advisor.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 1) => (v == null ? '–' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const hhmm = (t) => t.slice(11, 16);
const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const state = {
  store: {}, // Open-Meteo modelleri
  sg: null, // Stormglass (seçili konum)
  series: {}, // konum → saatlik seri
  spotId: localStorage.getItem('adp:spot') || SPOTS[0].id,
  day: null,
  time: null,
  loading: false,
};

const spot = () => SPOTS.find((s) => s.id === state.spotId) ?? SPOTS[0];
const today = () => localHourString().slice(0, 10);
// Bugün için geçmiş saatler değerlendirmeye girmez.
const minTime = () => (state.day === today() ? localHourString() : null);

function fullStore(forSpotId) {
  // Stormglass yalnızca çekildiği konum için karşılaştırmaya girer.
  if (state.sg && state.sg.forSpot === forSpotId) return { ...state.store, stormglass: state.sg };
  return state.store;
}

function rebuildSeries() {
  state.series = {};
  for (const s of SPOTS) state.series[s.id] = buildSeries(fullStore(s.id), s);
}

function dayLabel(day) {
  const base = new Date(today() + 'T00:00:00Z');
  const d = new Date(day + 'T00:00:00Z');
  const diff = Math.round((d - base) / 86400000);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

function availableDays() {
  const s = state.series[state.spotId];
  const days = [...new Set(s.times.map((t) => t.slice(0, 10)))];
  return days.filter((d) => d >= today());
}

function pickDefaultTime() {
  const s = state.series[state.spotId];
  const now = localHourString();
  if (state.day === today() && s.times.includes(now) && isDaylight(s, now)) return now;
  const best = bestWindow(s, spot(), state.day, minTime());
  if (best) return s.hours[best.mid.i].time;
  return s.times.find((t) => t.startsWith(state.day) && t >= now) ?? s.times.find((t) => t.startsWith(state.day)) ?? null;
}

// ---------- çizim ----------

function renderControls() {
  $('spot').innerHTML = SPOTS.map((s) => `<option value="${s.id}"${s.id === state.spotId ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  $('days').innerHTML = availableDays()
    .map((d) => `<button type="button" data-day="${d}" aria-pressed="${d === state.day}">${dayLabel(d)}</button>`)
    .join('');
}

function renderAlerts() {
  const failed = Object.values(fullStore(state.spotId)).filter((s) => !s.ok);
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
  const groups = { wave: 'dalga', wind: 'rüzgâr', ocean: 'akıntı/sıcaklık' };
  for (const [g, label] of Object.entries(groups)) {
    const ok = Object.values(state.store).filter((s) => s.def.group === g && s.ok).length;
    if (okCount > 0 && ok === 0) parts.push(`<div class="alert bad">Hiçbir ${label} kaynağı çalışmıyor; bu değerler gösterilemiyor ve kararlar eksik veriyle veriliyor.</div>`);
    else if (ok === 1 && g !== 'ocean') parts.push(`<div class="alert">Yalnızca bir ${label} kaynağı çalışıyor; karşılaştırma yapılamıyor.</div>`);
  }
  $('alerts').innerHTML = parts.join('');
}

function card(title, level, big, items, tag) {
  return `<article class="card lv-${level}"><h3>${esc(title)}</h3><div class="big">${esc(big)}</div>
    <ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${tag ? `<div class="tag">${esc(tag)}</div>` : ''}</article>`;
}

function renderVerdicts() {
  const s = state.series[state.spotId];
  const i = s.times.indexOf(state.time);
  if (i < 0) {
    $('verdicts').innerHTML = '<p class="muted">Bu gün için veri yok.</p>';
    $('when').textContent = '';
    return;
  }
  const h = s.hours[i];
  const sp = spot();
  $('when').textContent = `· ${sp.name} · ${dayLabel(state.day)} ${hhmm(state.time)}`;

  const boat = boatVerdict(h);
  const dive = diveVerdict(s, i, sp);
  const vis = dive.vis;
  const fish = fishActivity(s, i, sp);
  const best = bestWindow(s, sp, state.day, minTime());
  const ranking = rankSpots(state.series, SPOTS, state.day, minTime());
  const top = ranking[0];

  const html = [];
  html.push(card('Tekne (10 m+)', boat.level, boat.title, boat.reasons));
  html.push(card('Zıpkınla dalış', dive.level, dive.title, dive.reasons, dive.score != null ? `Uygunluk puanı: ${dive.score}/100` : ''));
  html.push(card('Su altı görüşü', vis.cls, vis.range ? `${vis.label} · tahmini ${vis.range}` : vis.label, vis.reasons,
    `Tahmindir, ölçüm değil · güven: ${vis.confidence}`));
  if (best) {
    const lvlText = { ideal: 'çok uygun', ok: 'uygun', marginal: 'sınırda', no: 'uygun saat yok' }[best.level];
    html.push(card('Hangi saat daha uygun?', best.level,
      best.level === 'no' ? 'Bugün için uygun pencere yok' : `${hhmm(best.from)}–${hhmm(best.to).slice(0, 2)}:59 arası`,
      [`${sp.name} için gün ışığındaki en iyi 3 saat (${lvlText}).`, `Ortalama puan ${best.score}/100.`]));
  } else {
    html.push(card('Hangi saat daha uygun?', 'unknown', state.day === today() ? 'Bugün gün ışığı kalmadı' : 'Belirlenemiyor',
      [state.day === today() ? 'Yarını seçerek en uygun saate bakabilirsin.' : 'Bu gün için yeterli veri yok.']));
  }
  if (top?.best) {
    const others = ranking.slice(1, 3).filter((r) => r.best).map((r) => `${r.spot.name} (${r.best.score})`);
    html.push(card('Hangi koy daha iyi?', top.best.level,
      top.best.level === 'no' ? 'Hiçbir koy uygun görünmüyor' : `${top.spot.name} · ${hhmm(top.best.from)}–${hhmm(top.best.to).slice(0, 2)}:59`,
      [`En yüksek puan: ${top.best.score}/100.`, others.length ? `Sonraki seçenekler: ${others.join(', ')}.` : 'Başka seçenek yok.']));
  }
  html.push(card('Balık aktivitesi', 'unknown',
    fish.species.filter((f) => f.level === 'yüksek').map((f) => f.name).join(', ') || 'Belirgin bir tür öne çıkmıyor',
    [...fish.species.map((f) => `${f.name}: ${f.level} – ${f.why}`), ...fish.general],
    'Genel kurallara dayalı yorumdur · güven: düşük'));
  $('verdicts').innerHTML = html.join('');
}

function renderHours() {
  const s = state.series[state.spotId];
  const sp = spot();
  const out = [];
  s.hours.forEach((h, i) => {
    if (!h.time.startsWith(state.day)) return;
    const day = isDaylight(s, h.time);
    const v = diveVerdict(s, i, sp);
    const lvl = day ? v.level : 'night';
    out.push(`<button type="button" class="hour ${day ? `lv-${lvl}` : 'night'}" data-time="${h.time}" aria-pressed="${h.time === state.time}"
      title="${esc(v.title)}"><b>${hhmm(h.time)}</b>${num(h.localWave)} m<br>${num(h.dv.wind_speed_10m, 0)} kn ${compass(h.dv.wind_direction_10m)}</button>`);
  });
  $('hours').innerHTML = out.join('') || '<p class="muted">Bu gün için veri yok.</p>';
  $('hours').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function fmtValue(v, value) {
  if (value == null) return '–';
  if (v.circular) return `${compass(value)} ${Math.round(value)}°`;
  return num(value, v.digits ?? 1);
}

function renderComparison() {
  const s = state.series[state.spotId];
  const i = s.times.indexOf(state.time);
  if (i < 0) {
    $('cmp').innerHTML = '';
    $('summary').innerHTML = '';
    return;
  }
  const h = s.hours[i];
  $('cmpWhen').textContent = `· ${spot().name} · ${dayLabel(state.day)} ${hhmm(state.time)}`;
  const sources = Object.values(fullStore(state.spotId));

  const key = ['wave_height', 'wind_speed_10m', 'wind_gusts_10m', 'swell_wave_height'];
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
    else if (v.circular) calc = `<td>–</td><td>–</td><td class="calc">${fmtValue(v, c.mean)}</td><td class="calc">${fmtValue(v, c.wmean)}</td><td>${c.count > 1 ? Math.round(c.spread) + '°' : '–'}</td>`;
    else calc = `<td>${fmtValue(v, c.min)}</td><td>${fmtValue(v, c.max)}</td><td class="calc">${fmtValue(v, c.mean)}</td><td class="calc">${fmtValue(v, c.wmean)}</td><td>${c.count > 1 ? fmtValue(v, c.spread) : '–'}</td>`;
    const note = c.circular && c.calm && c.count > 1 ? ' <span class="muted">(zayıf)</span>' : '';
    return `<tr><td>${esc(v.label)} <span class="muted">${esc(v.unit)}</span></td>${cells}${calc}
      <td><span class="pill ${c.agreement}">${AGREEMENT_LABEL[c.agreement]}${c.count > 1 ? ` · ${c.count}` : ''}</span>${note}</td></tr>`;
  }).join('');
  $('cmp').innerHTML = `${head}<tbody>${rows}</tbody>`;
}

function renderRanking() {
  $('rankWhen').textContent = `· ${dayLabel(state.day)}`;
  const ranking = rankSpots(state.series, SPOTS, state.day, minTime());
  const LVL = { ideal: 'Çok uygun', ok: 'Uygun', marginal: 'Sınırda', no: 'Önerilmez' };
  const rows = ranking.map((r, n) => {
    if (!r.best) return `<tr><td>${n + 1}. ${esc(r.spot.name)}</td><td colspan="6" class="left muted">veri yok</td></tr>`;
    const s = state.series[r.spot.id];
    const h = s.hours[r.best.mid.i];
    const vis = r.best.mid.v.vis;
    return `<tr class="clickable${r.spot.id === state.spotId ? ' selected' : ''}" data-spot="${r.spot.id}">
      <td>${n + 1}. ${esc(r.spot.name)}</td>
      <td class="calc">${r.best.score}</td>
      <td><span class="pill ${r.best.level}">${LVL[r.best.level]}</span></td>
      <td>${hhmm(r.best.from)}–${hhmm(r.best.to).slice(0, 2)}:59</td>
      <td>${num(h.localWave)} m <span class="muted">(açıkta ${num(h.dv.wave_height)})</span></td>
      <td>${num(h.dv.wind_speed_10m, 0)} kn ${compass(h.dv.wind_direction_10m)}</td>
      <td><span class="pill ${vis.cls}">${esc(vis.label)}</span></td></tr>`;
  }).join('');
  $('rank').innerHTML = `<thead><tr><th>Koy</th><th>Puan</th><th>Zıpkın</th><th>En iyi saat</th><th>Koy içi dalga</th><th>Rüzgâr</th><th>Görüş</th></tr></thead><tbody>${rows}</tbody>`;
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
  const GROUP = { wave: 'Dalga', wind: 'Rüzgâr / hava', ocean: 'Akıntı, sıcaklık, seviye', blend: 'Karma' };
  const rows = Object.values(fullStore(state.spotId)).map((src) => {
    const sd = src.ok ? src.spots[state.spotId] : null;
    const status = src.stale ? `<span class="pill partial">eski veri</span> <span class="muted">${esc(src.staleReason)}</span>`
      : src.ok ? '<span class="pill good">çalışıyor</span>' : `<span class="pill fail">hata</span> <span class="muted">${esc(src.error)}</span>`;
    return `<tr><td>${esc(src.def.name)}<br><span class="muted">${esc(src.def.provider)}</span></td>
      <td class="left">${GROUP[src.def.group]}</td>
      <td>~${src.def.resKm} km</td>
      <td class="left">${status}</td>
      <td class="left">${src.ok ? (src.runTime ? `${stamp(src.runTime)}<br><span class="muted">${ago(src.runTime)}${src.updateIntervalH ? ` · ${num(src.updateIntervalH, 0)} sa’te bir` : ''}</span>` : '<span class="muted">kaynak bildirmiyor</span>') : '–'}</td>
      <td class="left">${src.ok ? `${stamp(src.fetchedAt)}${src.fromCache ? '<br><span class="muted">önbellekten</span>' : ''}` : '–'}</td>
      <td>${sd?.distKm != null ? `${num(sd.distKm)} km` : '–'}</td></tr>`;
  }).join('');
  $('sources').innerHTML = `<thead><tr><th>Kaynak</th><th class="left">Ne veriyor</th><th>Çözünürlük</th><th class="left">Durum</th>
    <th class="left">Model güncellemesi</th><th class="left">Bizim çekme zamanımız</th><th>Model noktası uzaklığı</th></tr></thead><tbody>${rows}</tbody>`;
  const licenses = [...new Set(Object.values(fullStore(state.spotId)).map((src) => src.def.license))];
  $('licenses').innerHTML = licenses.map((l) => `Lisans: ${esc(l)}.`).join('<br>');
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
  $('logSummary').textContent = `${log.length} kayıt · görüş sınıfı ${hits} kez tuttu`
    + (bias != null ? ` · dalga tahmini ortalama ${num(Math.abs(bias))} m ${bias >= 0 ? 'fazla' : 'eksik'} (${waves.length} kayıt)` : '');
  $('log').innerHTML = `<thead><tr><th>Konum / saat</th><th>Tahmin görüş</th><th>Gerçek görüş</th><th>Tahmin dalga</th><th>Gerçek dalga</th><th class="left">Not</th></tr></thead><tbody>${
    log.slice(-15).reverse().map((e) => `<tr><td>${esc(e.spotName)}<br><span class="muted">${esc(e.time.replace('T', ' '))}</span></td>
      <td>${esc(e.forecastVis ?? '–')}</td><td>${num(e.actualVis, 0)} m (${visClass(e.actualVis)})</td>
      <td>${num(e.forecastWave)} m</td><td>${e.actualWave != null ? num(e.actualWave) + ' m' : '–'}</td><td class="left">${esc(e.note || '')}</td></tr>`).join('')
  }</tbody>`;
}

function saveLog(ev) {
  ev.preventDefault();
  const s = state.series[state.spotId];
  const i = s.times.indexOf(state.time);
  if (i < 0) return;
  const v = diveVerdict(s, i, spot());
  const log = readLog();
  log.push({
    savedAt: Date.now(),
    spotId: state.spotId,
    spotName: spot().name,
    time: state.time,
    actualVis: Number($('logVis').value),
    actualWave: $('logWave').value === '' ? null : Number($('logWave').value),
    note: $('logNote').value.trim(),
    forecastVis: v.vis.cls === 'unknown' ? null : v.vis.label,
    forecastWave: s.hours[i].localWave,
  });
  localStorage.setItem('adp:log', JSON.stringify(log));
  ev.target.reset();
  renderLog();
}

// ---------- akış ----------

function renderAll() {
  renderControls();
  renderAlerts();
  renderVerdicts();
  renderHours();
  renderComparison();
  renderRanking();
  renderSources();
  renderLog();
  const fetched = Object.values(state.store).filter((s) => s.ok).map((s) => s.fetchedAt);
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
    if (!days.includes(state.day)) {
      // Bugün gün ışığı kalmadıysa yarından başla.
      const s = state.series[state.spotId];
      state.day = days.find((d) => bestWindow(s, spot(), d, d === today() ? localHourString() : null)) ?? days[0] ?? today();
    }
    state.time = pickDefaultTime();
    renderAll();
  } finally {
    state.loading = false;
    $('refresh').disabled = false;
  }
}

$('refresh').addEventListener('click', () => load(true));
$('spot').addEventListener('change', async (e) => {
  state.spotId = e.target.value;
  localStorage.setItem('adp:spot', state.spotId);
  if (getStormglassKey()) {
    await refreshStormglass();
    rebuildSeries();
  }
  state.time = pickDefaultTime();
  renderAll();
});
$('days').addEventListener('click', (e) => {
  const day = e.target.closest('[data-day]')?.dataset.day;
  if (!day) return;
  state.day = day;
  state.time = pickDefaultTime();
  renderAll();
});
$('hours').addEventListener('click', (e) => {
  const time = e.target.closest('[data-time]')?.dataset.time;
  if (!time) return;
  state.time = time;
  renderVerdicts();
  renderHours();
  renderComparison();
});
$('rank').addEventListener('click', (e) => {
  const id = e.target.closest('[data-spot]')?.dataset.spot;
  if (!id) return;
  $('spot').value = id;
  $('spot').dispatchEvent(new Event('change'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('logForm').addEventListener('submit', saveLog);
$('sgKey').value = getStormglassKey();
$('sgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setStormglassKey($('sgKey').value.trim());
  await refreshStormglass();
  rebuildSeries();
  renderAll();
});

load();
