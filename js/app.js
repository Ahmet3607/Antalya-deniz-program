import { SPOTS, VARIABLES } from './config.js';
import { loadAll, loadStormglass, localHourString, getStormglassKey, setStormglassKey } from './sources.js';
import { buildSeries } from './analysis.js';
import { AGREEMENT_LABEL, describe, dirName, windName, windText } from './compare.js';
import { combined, bestWindow, rankSpots, calmestSpot, dayRain, rainInfo, isDaylight, sunTimes } from './advisor.js';
import { spearFish, boatFishing } from './fish.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 1) => (v == null ? '–' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const hhmm = (t) => t.slice(11, 16);
const endOf = (t) => `${t.slice(11, 13)}:59`;
const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

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
// Bugün için geçmiş saatler "en iyi saat" hesabına girmez.
const minTime = () => (state.day === today() ? localHourString() : null);
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

function dayLabel(day) {
  const d = new Date(day + 'T00:00:00Z');
  const diff = Math.round((d - new Date(today() + 'T00:00:00Z')) / 86400000);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${DAY_NAMES[d.getUTCDay()]}`;
  if (diff === 0) return `Bugün, ${date}`;
  if (diff === 1) return `Yarın, ${date}`;
  return date;
}

function availableDays() {
  return [...new Set(cur().times.map((t) => t.slice(0, 10)))].filter((d) => d >= today());
}

function pickDefaultTime() {
  const s = cur();
  const now = localHourString();
  if (state.day === today() && s.times.includes(now) && isDaylight(s, now)) return now;
  const best = bestWindow(s, spot(), state.day, minTime());
  if (best) return s.hours[best.mid.i].time;
  if (state.day === today() && s.times.includes(now)) return now;
  return `${state.day}T09:00`;
}

const TONE = { both: 'green', one: 'amber', none: 'red', unknown: 'grey' };
const DIVE_TONE = { ideal: 'green', ok: 'green', marginal: 'amber', no: 'red', unknown: 'grey' };
const BOAT_TONE = { good: 'green', caution: 'amber', bad: 'red', unknown: 'grey' };

const badge = (text, tone) => `<span class="badge t-${tone}">${esc(text)}</span>`;
const stat = (label, value, sub) => `<div class="stat"><dt>${esc(label)}</dt><dd>${esc(value)}${sub ? `<small>${esc(sub)}</small>` : ''}</dd></div>`;

function rainStat(rain) {
  if (!rain.known) return stat('Yağış', 'Veri yok');
  const label = rain.label.charAt(0).toLocaleUpperCase('tr-TR') + rain.label.slice(1);
  return stat('Yağış', label, rain.mm >= 0.1 ? `${num(rain.mm)} mm/sa` : '');
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
  const sel = state.time ? state.time.slice(11, 13) : '';
  $('hour').innerHTML = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
    .map((h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${h}:00</option>`).join('');
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

// ---------- genel durum ve saatler ----------

function renderStatus(ctx) {
  const el = $('status');
  if (!ctx) {
    el.className = 'status';
    el.innerHTML = `<div class="when">${esc(spot().name)} · ${esc(dayLabel(state.day))}</div><div class="title">Bu saat için veri yok</div>
      <div class="line">${Object.values(state.store).some((x) => x.ok)
    ? 'Tahminler en fazla 7 gün sonrasına kadar gelir. Daha yakın bir tarih seç.'
    : 'Kaynaklara ulaşılamadı. Bağlantını kontrol edip “Yenile”ye bas.'}</div>`;
    return;
  }
  const { h, c } = ctx;
  const titles = {
    both: 'Hem zıpkın hem tekne için uygun',
    one: c.label === 'Yalnız tekne' ? 'Yalnız tekne için uygun' : 'Yalnız zıpkın için uygun',
    none: 'Zıpkın ve tekne için uygun değil',
    unknown: 'Karar verilemiyor',
  };
  const bits = [];
  bits.push(windText(h.dv.wind_speed_10m, h.dv.wind_direction_10m));
  if (h.dv.wave_height != null) bits.push(`dalga ${num(h.dv.wave_height)} m`);
  bits.push(c.dive.rain.known ? c.dive.rain.label : 'yağış verisi yok');
  if (h.dv.sea_surface_temperature != null) bits.push(`su ${num(h.dv.sea_surface_temperature, 0)} °C`);
  const line = bits.join(' · ');
  el.className = `status t-${TONE[c.level]}`;
  el.innerHTML = `<div class="when">${esc(spot().name)} · ${esc(dayLabel(state.day))} · ${hhmm(state.time)}</div>
    <div class="title">${titles[c.level]}</div>
    <div class="line">${esc(line.charAt(0).toLocaleUpperCase('tr-TR') + line.slice(1))}${c.dive.daylight === false ? ' · gece, fener gerekir' : ''}</div>${why(c)}`;
}

// Zıpkın ya da tekne uygun değilse nedenini açıkça yazar.
function why(c) {
  const blocks = [];
  const diveOk = c.dive.level === 'ideal' || c.dive.level === 'ok';
  const boatOk = c.boat.level === 'good';
  if (!diveOk && c.dive.notes.length) blocks.push(['Zıpkın neden ' + (c.dive.level === 'marginal' ? 'sınırda' : 'önerilmiyor'), c.dive.notes]);
  if (!boatOk && c.boat.notes.length) blocks.push(['Tekne neden ' + (c.boat.level === 'bad' ? 'önerilmiyor' : 'dikkat istiyor'), c.boat.notes]);
  return blocks.map(([title, notes]) => `<div class="why"><b>${esc(title)}</b><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`).join('');
}

function renderHours() {
  const s = cur();
  const now = localHourString();
  const short = { 'İkisi de': 'İkisi de', 'Yalnız tekne': 'Tekne', 'Yalnız zıpkın': 'Zıpkın', 'Uygun değil': 'Uygun değil', 'Veri yok': 'Veri yok' };
  const out = [];
  s.hours.forEach((h, i) => {
    if (!h.time.startsWith(state.day)) return;
    const c = combined(s, i, spot());
    out.push(`<button type="button" class="hour ${c.level}${h.time < now ? ' past' : ''}" data-time="${h.time}"
      aria-pressed="${h.time === state.time}" title="${esc(c.label)}"><b>${h.time.slice(11, 13)}</b><span>${short[c.label]}</span></button>`);
  });
  $('dayName').textContent = dayLabel(state.day);
  const sun = sunTimes(s, state.day);
  $('sun').textContent = sun ? `Gün doğumu ${sun.rise} · Gün batımı ${sun.set}` : '';
  $('hours').innerHTML = out.join('') || '<p class="muted">Bu gün için veri yok.</p>';
}

// ---------- zıpkın ----------

function renderDive(ctx) {
  const el = $('dive');
  if (!ctx) {
    el.innerHTML = '<div class="head"><h2>Zıpkın</h2></div><p class="lead">Bu saat için veri yok.</p>';
    return;
  }
  const { h, c, i } = ctx;
  const d = c.dive;
  const sp = spot();
  const s = cur();
  const best = bestWindow(s, sp, state.day, minTime());
  const ranking = rankSpots(state.series, SPOTS, state.day, minTime()).filter((r) => r.best).slice(0, 3);
  const fish = spearFish(s, i, sp);

  const bestText = !best ? (state.day === today() ? 'Bugün gün ışığı kalmadı' : 'Belirlenemiyor')
    : best.level === 'no' ? 'Uygun saat yok' : `${hhmm(best.from)}–${endOf(best.to)}`;
  const LVL = { ideal: 'çok uygun', ok: 'uygun', marginal: 'sınırda', no: 'önerilmez' };

  el.innerHTML = `
    <div class="head"><h2>Zıpkın</h2>${badge(d.title, DIVE_TONE[d.level])}</div>
    ${d.notes.length || d.info?.length ? `<ul class="reasons">${[...d.notes, ...(d.info ?? [])].map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <dl class="stats">
      ${stat('Su altı görüşü', d.vis.label, d.vis.range ? `tahmini ${d.vis.range}` : '')}
      ${stat('Koy içi dalga', h.localWave == null ? 'Veri yok' : `${num(h.localWave)} m`, h.dv.wave_height != null ? `açıkta ${num(h.dv.wave_height)} m` : '')}
      ${stat('Rüzgâr', h.dv.wind_speed_10m == null ? 'Veri yok' : windText(h.dv.wind_speed_10m, h.dv.wind_direction_10m))}
      ${stat('Akıntı', h.dv.ocean_current_velocity == null ? 'Veri yok' : h.dv.ocean_current_velocity < 0.15 ? 'Yok denecek kadar az' : `${num(h.dv.ocean_current_velocity)} kn`)}
      ${stat('Su sıcaklığı', h.dv.sea_surface_temperature == null ? 'Veri yok' : `${num(h.dv.sea_surface_temperature)} °C`)}
      ${rainStat(d.rain)}
    </dl>
    <p class="note">Görüş: ${esc(d.vis.notes.join(' '))} Tahmindir, ölçüm değil (güven: ${esc(d.vis.confidence)}).</p>
    <div class="cols">
      <div>
        <h3>Ne zaman, nerede</h3>
        <ul class="rows">
          <li><span>${esc(sp.name)} için en iyi saat</span><span>${esc(bestText)}</span></li>
          ${ranking.map((r, n) => `<li><span>${n + 1}. <button type="button" data-spot="${r.spot.id}">${esc(r.spot.name)}</button></span>
            <span>${hhmm(r.best.from)}–${endOf(r.best.to)} · ${LVL[r.best.level]}</span></li>`).join('')}
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
  const { h, c, i } = ctx;
  const b = c.boat;
  const calm = calmestSpot(state.series, SPOTS, state.time);
  const methods = boatFishing(cur(), i);
  const vis = h.dv.visibility;
  el.innerHTML = `
    <div class="head"><h2>Tekne</h2>${badge(b.title, BOAT_TONE[b.level])}</div>
    ${b.notes.length ? `<ul class="reasons">${b.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <dl class="stats">
      ${stat('Açık denizde dalga', h.dv.wave_height == null ? 'Veri yok' : `${num(h.dv.wave_height)} m`, h.dv.wave_direction != null ? `${dirName(h.dv.wave_direction)} yönünden${h.dv.wave_period != null ? `, ${num(h.dv.wave_period, 0)} sn arayla` : ''}` : '')}
      ${stat('Rüzgâr', h.dv.wind_speed_10m == null ? 'Veri yok' : windText(h.dv.wind_speed_10m, h.dv.wind_direction_10m))}
      ${stat('Hamle', h.dv.wind_gusts_10m == null ? 'Veri yok' : `${num(h.dv.wind_gusts_10m, 0)} km/sa`)}
      ${rainStat(c.dive.rain)}
      ${stat('Hava görüşü', vis == null ? 'Veri yok' : vis >= 10 ? 'Açık' : vis >= 4 ? 'Puslu' : 'Kısıtlı', vis == null ? '' : `${num(vis, 0)} km`)}
      ${stat('En sakin bölge', calm ? calm.spot.name : 'Veri yok', calm ? `dalga ${num(calm.wave)} m` : '')}
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
    <p class="note">Öneriler mevsime ve o saatin dalga, rüzgâr, akıntı ve ışık durumuna göre seçilir. Derinlik ve yem bilgileri genel amatör balıkçılık bilgisidir.</p>`;
}

// ---------- yağış ----------

function renderRain(ctx) {
  const s = cur();
  const day = dayRain(s, state.day);
  const sel = ctx ? rainInfo(ctx.h) : null;
  const tone = !sel || !sel.known ? 'grey' : sel.thunder || sel.cls === 'heavy' || sel.cls === 'violent' ? 'red'
    : sel.cls === 'moderate' || sel.cls === 'light' ? 'amber' : 'green';
  const selLabel = sel?.known ? sel.label.charAt(0).toLocaleUpperCase('tr-TR') + sel.label.slice(1) : 'Veri yok';
  $('rain').innerHTML = `
    <div class="head"><h2>Yağış</h2>${badge(selLabel, tone)}</div>
    <p class="lead">${esc(day.text)}</p>
    ${day.known ? `<dl class="stats">
      ${stat(`Saat ${state.time ? hhmm(state.time) : ''}`, sel?.known ? `${num(sel.mm)} mm` : 'Veri yok', sel?.known && sel.max >= 0.1 ? `en yüksek tahmin ${num(sel.max)} mm` : '')}
      ${stat('Gün toplamı', `${num(day.total)} mm`, `${day.wetHours} saat yağışlı`)}
      ${stat('Kaynak uyumu', sel?.known ? `${sel.wet}/${sel.models} model` : '–', sel?.known ? 'bu saatte yağış gösteriyor' : '')}
    </dl>` : ''}`;

  $('rainDay').textContent = dayLabel(state.day);
  if (!day.known) {
    $('rainChart').innerHTML = '';
    return;
  }
  const top = Math.max(2, ...day.hours.map((x) => x.mm ?? 0));
  $('rainChart').innerHTML = day.hours.map((x) => {
    const mm = x.mm ?? 0;
    const hr = x.time.slice(11, 13);
    const heavy = x.thunder || mm >= 4;
    return `<div class="col${x.time === state.time ? ' sel' : ''}" title="${hr}:00 – ${x.known ? `${num(mm)} mm, ${esc(x.label)}` : 'veri yok'}">
      <span class="mm">${mm >= 0.1 ? num(mm) : ''}</span>
      <span class="bar${mm < 0.1 ? ' zero' : heavy ? ' heavy' : ''}" style="height:${mm < 0.1 ? 2 : Math.max(4, (mm / top) * 100)}px"></span>
      <span class="hr">${Number(hr) % 3 === 0 || x.time === state.time ? hr : ''}</span></div>`;
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
  const { h } = ctx;
  $('cmpWhen').textContent = `${hhmm(state.time)}`;
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
  const ranking = rankSpots(state.series, SPOTS, state.day, minTime());
  const LVL = { ideal: 'Çok uygun', ok: 'Uygun', marginal: 'Sınırda', no: 'Önerilmez' };
  const rows = ranking.map((r, n) => {
    if (!r.best) return `<tr><td>${n + 1}. ${esc(r.spot.name)}</td><td colspan="5" class="wrap muted">veri yok</td></tr>`;
    const s = state.series[r.spot.id];
    const h = s.hours[r.best.mid.i];
    const vis = r.best.mid.v.vis;
    return `<tr class="clickable${r.spot.id === state.spotId ? ' selected' : ''}" data-spot="${r.spot.id}">
      <td>${n + 1}. ${esc(r.spot.name)}</td>
      <td><span class="pill ${r.best.level}">${LVL[r.best.level]}</span></td>
      <td>${hhmm(r.best.from)}–${endOf(r.best.to)}</td>
      <td>${num(h.localWave)} m</td>
      <td>${esc(windText(h.dv.wind_speed_10m, h.dv.wind_direction_10m))}</td>
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
  const ctx = context();
  if (!ctx) return;
  const log = readLog();
  log.push({
    savedAt: Date.now(),
    spotId: state.spotId,
    spotName: spot().name,
    time: state.time,
    actualVis: Number($('logVis').value),
    actualWave: $('logWave').value === '' ? null : Number($('logWave').value),
    note: $('logNote').value.trim(),
    forecastVis: ctx.c.dive.vis.cls === 'unknown' ? null : ctx.c.dive.vis.label,
    forecastWave: ctx.h.localWave,
  });
  localStorage.setItem('adp:log', JSON.stringify(log));
  ev.target.reset();
  renderLog();
}

// ---------- akış ----------

// Seçili konum ve saat için hesaplanmış her şey; o saat için veri yoksa null.
function context() {
  const s = cur();
  const i = s.times.indexOf(state.time);
  if (i < 0) return null;
  return { i, h: s.hours[i], c: combined(s, i, spot()) };
}

function renderAll() {
  const ctx = context();
  renderPicker();
  renderAlerts();
  renderStatus(ctx);
  renderHours();
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
      // Bugün gün ışığı kalmadıysa yarından başla.
      state.day = days.find((d) => bestWindow(cur(), spot(), d, d === today() ? localHourString() : null)) ?? days[0] ?? today();
      state.time = pickDefaultTime();
    } else if (!state.time) {
      state.time = pickDefaultTime();
    }
    renderAll();
  } finally {
    state.loading = false;
    $('refresh').disabled = false;
  }
}

async function selectSpot(id) {
  state.spotId = id;
  localStorage.setItem('adp:spot', id);
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
  state.day = e.target.value;
  state.time = pickDefaultTime();
  renderAll();
});
$('hour').addEventListener('change', (e) => {
  state.time = `${state.day}T${e.target.value}:00`;
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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* çevrimdışı destek yok, uygulama yine çalışır */ });
