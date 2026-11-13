// Kaynak (model), konum ve eşik tanımları.
// Buradaki sayılar tek yerden ayarlanabilsin diye ayrı tutuluyor.

export const TIMEZONE = 'Europe/Istanbul';
export const PAST_DAYS = 3; // görüş tahmini için geçmiş 72 saat
export const FORECAST_DAYS = 8; // dalga modellerinin ulaştığı en uzun süre

const OM_LICENSE = 'Open-Meteo üzerinden · veri CC BY 4.0 · ücretsiz API yalnızca ticari olmayan kullanım';

// group: 'wave' = dalga modeli, 'ocean' = akıntı/sıcaklık/seviye, 'wind' = atmosfer modeli
export const MODELS = [
  {
    id: 'meteofrance_wave', group: 'wave', api: 'marine', metaPath: 'meteofrance_wave',
    name: 'MFWAM', provider: 'Météo-France / Copernicus Marine', resKm: 8, license: OM_LICENSE,
  },
  {
    id: 'ewam', group: 'wave', api: 'marine', metaPath: 'dwd_ewam',
    name: 'EWAM', provider: 'DWD (Almanya)', resKm: 5, license: OM_LICENSE,
  },
  {
    id: 'ecmwf_wam025', group: 'wave', api: 'marine', metaPath: 'ecmwf_wam025',
    name: 'ECMWF WAM', provider: 'ECMWF', resKm: 25, license: OM_LICENSE,
  },
  {
    id: 'ncep_gfswave025', group: 'wave', api: 'marine', metaPath: 'ncep_gfswave025',
    name: 'GFS Wave', provider: 'NOAA (ABD)', resKm: 25, license: OM_LICENSE,
  },
  {
    id: 'gwam', group: 'wave', api: 'marine', metaPath: 'dwd_gwam',
    name: 'GWAM', provider: 'DWD (Almanya)', resKm: 25, license: OM_LICENSE,
  },
  {
    id: 'meteofrance_currents', group: 'ocean', api: 'marine', metaPath: 'meteofrance_currents',
    name: 'Mercator Okyanus', provider: 'Mercator Ocean / Copernicus Marine', resKm: 8, license: OM_LICENSE,
  },
  {
    id: 'icon_seamless', group: 'wind', api: 'weather', metaPath: 'dwd_icon_eu',
    name: 'ICON', provider: 'DWD (Almanya)', resKm: 7, license: OM_LICENSE,
  },
  {
    id: 'meteofrance_seamless', group: 'wind', api: 'weather', metaPath: 'meteofrance_arpege_europe',
    name: 'ARPEGE', provider: 'Météo-France', resKm: 11, license: OM_LICENSE,
  },
  {
    id: 'gfs_seamless', group: 'wind', api: 'weather', metaPath: 'ncep_gfs013',
    name: 'GFS', provider: 'NOAA (ABD)', resKm: 13, license: OM_LICENSE,
  },
  {
    id: 'ecmwf_ifs025', group: 'wind', api: 'weather', metaPath: 'ecmwf_ifs025',
    name: 'ECMWF IFS', provider: 'ECMWF', resKm: 25, license: OM_LICENSE,
  },
];

// Stormglass isteğe bağlı: kullanıcı kendi anahtarını girerse eklenir.
// Kendi modeli değildir, başka modellerin karmasıdır; bu yüzden uyum hesabında düşük ağırlık alır.
export const STORMGLASS = {
  id: 'stormglass', group: 'blend', api: 'stormglass',
  name: 'Stormglass', provider: 'Stormglass (karma kaynak)', resKm: 20,
  license: 'Ücretsiz katman günde 10 istek, ticari kullanım yok · ücretli planlar 19 €/ay’dan başlar',
  blend: true,
};

export const VARS_BY_GROUP = {
  wave: ['wave_height', 'wave_direction', 'wave_period',
    'swell_wave_height', 'swell_wave_direction', 'swell_wave_period'],
  ocean: ['ocean_current_velocity', 'ocean_current_direction',
    'sea_surface_temperature', 'sea_level_height_msl'],
  wind: ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    'visibility', 'precipitation', 'pressure_msl', 'weather_code'],
};

// Karşılaştırma tablosunda gösterilecek değerler.
// tolAbs/tolRel: "uyumlu" sayılacak fark; iki katı "kısmen uyumlu".
export const VARIABLES = [
  { key: 'wave_height', label: 'Dalga yüksekliği', unit: 'm', digits: 1, tolAbs: 0.2, tolRel: 0.3 },
  { key: 'wave_direction', label: 'Dalga yönü', unit: '°', circular: true, strengthKey: 'wave_height', calmBelow: 0.2 },
  { key: 'wave_period', label: 'Dalga periyodu', unit: 'sn', digits: 1, tolAbs: 1.5, tolRel: 0.25 },
  { key: 'swell_wave_height', label: 'Swell yüksekliği', unit: 'm', digits: 1, tolAbs: 0.2, tolRel: 0.3 },
  { key: 'swell_wave_direction', label: 'Swell yönü', unit: '°', circular: true, strengthKey: 'swell_wave_height', calmBelow: 0.2 },
  { key: 'wind_speed_10m', label: 'Rüzgâr hızı', unit: 'km/sa', digits: 0, tolAbs: 7, tolRel: 0.3 },
  { key: 'wind_direction_10m', label: 'Rüzgâr yönü', unit: '°', circular: true, strengthKey: 'wind_speed_10m', calmBelow: 9 },
  { key: 'wind_gusts_10m', label: 'Rüzgâr hamlesi', unit: 'km/sa', digits: 0, tolAbs: 11, tolRel: 0.3 },
  { key: 'precipitation', label: 'Yağış', unit: 'mm/sa', digits: 1, tolAbs: 0.5, tolRel: 0.5 },
  { key: 'ocean_current_velocity', label: 'Akıntı hızı', unit: 'kn', digits: 1, tolAbs: 0.2, tolRel: 0.4 },
  { key: 'ocean_current_direction', label: 'Akıntı yönü', unit: '°', circular: true, strengthKey: 'ocean_current_velocity', calmBelow: 0.2 },
  { key: 'sea_surface_temperature', label: 'Deniz sıcaklığı', unit: '°C', digits: 1, tolAbs: 1, tolRel: 0 },
  { key: 'sea_level_height_msl', label: 'Deniz seviyesi (gelgit dahil)', unit: 'm', digits: 2, tolAbs: 0.1, tolRel: 0 },
  { key: 'visibility', label: 'Görüş mesafesi (hava)', unit: 'km', digits: 0, tolAbs: 5, tolRel: 0.4 },
];

// Konumlar yaklaşık koordinatlardır (kıyıdan biraz açıkta).
// open: dalganın koya girebildiği yön aralığı (dalganın GELDİĞİ yön, derece, saat yönünde).
// river: yağmur sonrası dere/nehir bulanıklığı etkisi (0 = yok, 1 = çok).
// shelter: koyun kendi içindeki ek korunma (1 = yok, daha küçük = daha korunaklı).
// habitat: zemin tipi. sand = kum/çakıl, rock = kayalık kıyı, reef = ada/sığlık/sert düşüş,
//          river = dere ağzı, seagrass = eriştelik. Balık tahmini buna göre süzülür.
export const SPOTS = [
  { id: 'konyaalti', name: 'Konyaaltı', lat: 36.855, lon: 30.645, open: [90, 190], river: 0.9, shelter: 1, habitat: ['sand', 'river'] },
  { id: 'falezler', name: 'Falezler (Kaleiçi)', lat: 36.872, lon: 30.715, open: [140, 250], river: 0.5, shelter: 1, habitat: ['rock'] },
  { id: 'lara', name: 'Lara / Düden', lat: 36.845, lon: 30.800, open: [130, 260], river: 1, shelter: 1, habitat: ['sand', 'river', 'rock'] },
  { id: 'sicanadasi', name: 'Sıçan Adası', lat: 36.795, lon: 30.590, open: [50, 190], river: 0.2, shelter: 0.9, habitat: ['reef', 'rock'] },
  { id: 'beldibi', name: 'Beldibi', lat: 36.720, lon: 30.585, open: [30, 170], river: 0.3, shelter: 1, habitat: ['rock', 'sand'] },
  { id: 'kemer', name: 'Kemer', lat: 36.600, lon: 30.580, open: [20, 170], river: 0.4, shelter: 0.9, habitat: ['rock', 'sand'] },
  { id: 'phaselis', name: 'Phaselis', lat: 36.523, lon: 30.558, open: [40, 160], river: 0.1, shelter: 0.7, habitat: ['rock', 'seagrass'] },
  { id: 'ucadalar', name: 'Tekirova / Üç Adalar', lat: 36.458, lon: 30.552, open: [20, 200], river: 0.1, shelter: 1, habitat: ['reef', 'rock'] },
  { id: 'cirali', name: 'Çıralı / Olimpos', lat: 36.410, lon: 30.488, open: [40, 170], river: 0.4, shelter: 1, habitat: ['sand', 'rock', 'river'] },
  { id: 'adrasan', name: 'Adrasan', lat: 36.300, lon: 30.480, open: [90, 170], river: 0.2, shelter: 0.7, habitat: ['rock', 'sand'] },
];

// 10 m üzeri motorlu tekne için eşikler (açık deniz değerleri üzerinden). Rüzgâr km/sa.
export const BOAT_LIMITS = {
  good: { wave: 0.8, wind: 28, gust: 40 },
  caution: { wave: 1.5, wind: 40, gust: 55 },
};

// Zıpkınla dalış için eşikler (koy içi tahmini dalga üzerinden).
export const DIVE_LIMITS = {
  ideal: { wave: 0.3, wind: 18, current: 0.5 },
  ok: { wave: 0.5, wind: 28, current: 0.8 },
  marginal: { wave: 0.8, wind: 37, current: 1.2 },
};
