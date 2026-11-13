// Veri kaynakları. Her model ayrı istekle çekilir; biri çalışmazsa diğerleri devam eder.

import { MODELS, STORMGLASS, VARS_BY_GROUP, SPOTS, TIMEZONE, PAST_DAYS, FORECAST_DAYS } from './config.js';

const HOSTS = {
  marine: 'https://marine-api.open-meteo.com',
  weather: 'https://api.open-meteo.com',
};
const CACHE_MIN = 60; // modeller 3–12 saatte bir güncellenir; günlük istek sınırını korur
const STALE_H = 12; // kaynak çalışmazsa en fazla bu kadar eski veri kullanılır
const SG_CACHE_H = 6; // Stormglass ücretsiz katman günde 10 istek; idareli kullan
const TR_OFFSET_MS = 3 * 3600 * 1000; // Türkiye sabit UTC+3

export function distanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Türkiye saatiyle "YYYY-MM-DDTHH:00"
export function localHourString(date = new Date()) {
  return new Date(date.getTime() + TR_OFFSET_MS).toISOString().slice(0, 13) + ':00';
}

function cacheGet(key, maxAgeMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return Date.now() - obj.fetchedAt <= maxAgeMs ? obj : null;
  } catch {
    return null;
  }
}

function cacheSet(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    // depolama dolu ya da kapalı: önbelleksiz devam
  }
}

async function getJson(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) {
      let reason = '';
      try {
        const body = await res.json();
        reason = body.reason || body.errors?.key || JSON.stringify(body.errors ?? '');
      } catch { /* gövde JSON değil */ }
      throw new Error(`HTTP ${res.status}${reason ? ' – ' + reason : ''}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('zaman aşımı (20 sn)');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function convert(key, value, unit) {
  if (value == null) return null;
  if (key === 'ocean_current_velocity') {
    if (unit === 'km/h') return value / 1.852;
    if (unit === 'm/s') return value * 1.94384;
    return value;
  }
  if (key === 'visibility') return value / 1000;
  return value;
}

async function fetchOpenMeteo(model) {
  const vars = VARS_BY_GROUP[model.group];
  const params = new URLSearchParams({
    latitude: SPOTS.map((s) => s.lat).join(','),
    longitude: SPOTS.map((s) => s.lon).join(','),
    hourly: vars.join(','),
    models: model.id,
    past_days: PAST_DAYS,
    forecast_days: FORECAST_DAYS,
    timezone: TIMEZONE,
    cell_selection: 'sea',
  });
  if (model.api === 'weather') {
    params.set('wind_speed_unit', 'kn');
    params.set('daily', 'sunrise,sunset');
  }
  const path = model.api === 'marine' ? '/v1/marine' : '/v1/forecast';
  const [data, meta] = await Promise.all([
    getJson(`${HOSTS[model.api]}${path}?${params}`),
    getJson(`${HOSTS[model.api]}/data/${model.metaPath}/static/meta.json`).catch(() => null),
  ]);

  const list = Array.isArray(data) ? data : [data];
  const spots = {};
  let anyValue = false;
  list.forEach((loc, i) => {
    const spot = SPOTS[i];
    const varsOut = {};
    for (const key of vars) {
      const arr = loc.hourly?.[key];
      const unit = loc.hourly_units?.[key];
      varsOut[key] = arr ? arr.map((v) => convert(key, v, unit)) : null;
      if (arr && arr.some((v) => v != null)) anyValue = true;
    }
    spots[spot.id] = {
      lat: loc.latitude,
      lon: loc.longitude,
      distKm: distanceKm(spot.lat, spot.lon, loc.latitude, loc.longitude),
      time: loc.hourly?.time ?? [],
      vars: varsOut,
      daily: loc.daily ?? null,
    };
  });
  if (!anyValue) throw new Error('kaynak yanıt verdi ama bu bölge için değer içermiyor');

  return {
    fetchedAt: Date.now(),
    runTime: meta?.last_run_initialisation_time ? meta.last_run_initialisation_time * 1000 : null,
    availTime: meta?.last_run_availability_time ? meta.last_run_availability_time * 1000 : null,
    updateIntervalH: meta?.update_interval_seconds ? meta.update_interval_seconds / 3600 : null,
    spots,
  };
}

// Tüm Open-Meteo modellerini paralel çeker. Sonuç: { [modelId]: { def, ok, error?, ...veri } }
export async function loadAll({ force = false } = {}) {
  const results = await Promise.all(MODELS.map(async (def) => {
    const key = `adp:model:${def.id}`;
    if (!force) {
      const cached = cacheGet(key, CACHE_MIN * 60000);
      if (cached) return [def.id, { def, ok: true, fromCache: true, ...cached }];
    }
    try {
      const fresh = await fetchOpenMeteo(def);
      cacheSet(key, fresh);
      return [def.id, { def, ok: true, ...fresh }];
    } catch (err) {
      const error = err.message || String(err);
      // Kaynak şu an çalışmıyorsa eski veriyi kullan ama eski olduğunu belirt.
      const old = cacheGet(key, STALE_H * 3600000);
      if (old) return [def.id, { def, ok: true, fromCache: true, stale: true, staleReason: error, ...old }];
      return [def.id, { def, ok: false, error }];
    }
  }));
  return Object.fromEntries(results);
}

// ---- Stormglass (isteğe bağlı, kullanıcının kendi anahtarıyla) ----

const SG_PARAMS = {
  waveHeight: ['wave_height', 1],
  waveDirection: ['wave_direction', 1],
  wavePeriod: ['wave_period', 1],
  swellHeight: ['swell_wave_height', 1],
  swellDirection: ['swell_wave_direction', 1],
  swellPeriod: ['swell_wave_period', 1],
  windSpeed: ['wind_speed_10m', 1.94384], // m/sn → kn
  windDirection: ['wind_direction_10m', 1],
  gust: ['wind_gusts_10m', 1.94384],
  currentSpeed: ['ocean_current_velocity', 1.94384],
  currentDirection: ['ocean_current_direction', 1],
  waterTemperature: ['sea_surface_temperature', 1],
  seaLevel: ['sea_level_height_msl', 1],
  visibility: ['visibility', 1], // km
};

export function getStormglassKey() {
  try { return localStorage.getItem('adp:sgkey') || ''; } catch { return ''; }
}

export function setStormglassKey(key) {
  try {
    if (key) localStorage.setItem('adp:sgkey', key);
    else localStorage.removeItem('adp:sgkey');
  } catch { /* yok say */ }
}

// Yalnızca seçili konum için çekilir ve 6 saat önbellekte tutulur.
export async function loadStormglass(spot) {
  const def = STORMGLASS;
  const apiKey = getStormglassKey();
  if (!apiKey) return null;
  const key = `adp:sg:${spot.id}`;
  const cached = cacheGet(key, SG_CACHE_H * 3600000);
  if (cached) return { def, ok: true, fromCache: true, ...cached };
  try {
    const start = Math.floor(Date.now() / 1000) - 3600;
    const end = start + 3 * 86400;
    const params = new URLSearchParams({
      lat: spot.lat, lng: spot.lon, params: Object.keys(SG_PARAMS).join(','), source: 'sg', start, end,
    });
    const data = await getJson(`https://api.stormglass.io/v2/weather/point?${params}`, {
      headers: { Authorization: apiKey },
    });
    const time = [];
    const vars = Object.fromEntries(Object.values(SG_PARAMS).map(([k]) => [k, []]));
    for (const h of data.hours ?? []) {
      time.push(localHourString(new Date(h.time)));
      for (const [sgName, [k, factor]] of Object.entries(SG_PARAMS)) {
        const v = h[sgName]?.sg;
        vars[k].push(v == null ? null : v * factor);
      }
    }
    if (time.length === 0) throw new Error('yanıtta saatlik veri yok');
    const fresh = {
      fetchedAt: Date.now(),
      runTime: null,
      availTime: null,
      updateIntervalH: null,
      quota: data.meta ? `${data.meta.requestCount}/${data.meta.dailyQuota}` : null,
      spots: {
        [spot.id]: {
          lat: data.meta?.lat ?? spot.lat, lon: data.meta?.lng ?? spot.lon, distKm: null, time, vars, daily: null,
        },
      },
    };
    cacheSet(key, fresh);
    return { def, ok: true, ...fresh };
  } catch (err) {
    return { def, ok: false, error: err.message || String(err) };
  }
}
