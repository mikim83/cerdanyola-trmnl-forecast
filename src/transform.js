// Reduce forecast.json (meteo.dob-world.com, ~62 KB, 155 horas y 7 días) a lo que pintan
// las plantillas. El fichero se regenera cada 30 minutos, así que aquí se descartan las
// horas ya pasadas. Los números salen con punto decimal: las plantillas dan formato.
function transform(input) {
  // Se descartan los registros mal formados (sin hora o sin fecha) en vez de fallar.
  var hours = ((input && input.hours) || []).filter(function (h) { return h && typeof h.t === 'string' && typeof h.ts === 'number'; });
  var days = ((input && input.days) || []).filter(function (d) { return d && typeof d.date === 'string'; });
  if (!hours.length || !days.length) return { no_data: true };

  // "2026-10-07T17:00" -> ms como si la hora local fuera UTC (los ejes de Highcharts van
  // en UTC, así que muestran la hora local).
  function localMs(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function rnd(v) { return isNum(v) ? Math.round(v) : null; }
  function rnd1(v) { return isNum(v) ? Math.round(v * 10) / 10 : null; }

  var nowSec = Math.floor(Date.now() / 1000);
  var h0 = Math.floor(nowSec / 3600) * 3600;
  var left = hours.filter(function (h) { return h.ts >= h0; });
  if (!left.length) left = hours.slice(-24);
  var next = left.slice(0, 25);
  var cur = left[0];
  var today = cur.t.slice(0, 10);

  // Índice del icono (el orden está en shared.liquid): sol, luna, nube, nube-sol, nube-luna,
  // niebla, llovizna, lluvia, tormenta, nieve.
  var ICON = { clear: 0, mostly_clear: 3, partly_cloudy: 3, cloudy: 2, overcast: 2, fog: 5, light_rain: 6, rain: 7, heavy_rain: 7, thunder: 8, snow: 9 };
  // Orden de los textos del cielo en shared.liquid (s_sky); el último es «sin dato».
  var LABELS = ['clear', 'mostly_clear', 'partly_cloudy', 'cloudy', 'overcast', 'fog', 'light_rain', 'rain', 'heavy_rain', 'thunder', 'snow'];
  function sky(s) {
    var code = (s && s.code) || 'unknown', night = !!(s && s.night), i = ICON[code];
    if (i == null) i = 2;
    if (night && (i === 0 || i === 3)) i = i === 0 ? 1 : 4;
    var lbl = LABELS.indexOf(code);
    return { code: code, icon: i, lbl: lbl < 0 ? LABELS.length : lbl };
  }

  var now = {
    time: cur.t.slice(11, 16),
    sky: sky(cur.sky),
    temp: rnd1(cur.temp), feels: rnd1(cur.feels), hum: rnd(cur.hum), pop: rnd(cur.pop),
    wind: rnd(cur.wind), gust: rnd(cur.gust), wind_dir: cur.wind_dir || '', uv: rnd1(cur.uv)
  };

  // Tramos con lluvia en las próximas 24 h: horas con ≥0,1 mm, unidas si las separa 1 h.
  var wins = [], w = null;
  next.slice(0, 24).forEach(function (h, i) {
    var wet = isNum(h.precip) && h.precip >= 0.1;
    if (wet) {
      if (w && i - w.last <= 2) { w.last = i; w.mm += h.precip; }
      else { w = { first: i, last: i, mm: h.precip }; wins.push(w); }
    }
  });
  var rain = wins.slice(0, 2).map(function (x) {
    var a = next[x.first], b = next[Math.min(x.last + 1, next.length - 1)];
    return {
      from: a.t.slice(11, 13), to: b.t.slice(11, 13), mm: rnd1(x.mm),
      tomorrow: a.t.slice(0, 10) !== today
    };
  });
  var total_mm = rnd1(next.slice(0, 24).reduce(function (s, h) { return s + (isNum(h.precip) ? h.precip : 0); }, 0));

  var outDays = days.filter(function (d) { return d.date >= today; }).slice(0, 7).map(function (d, i) {
    var dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
    return {
      date: d.date, dow: dow, today: i === 0, sky: sky(d.sky),
      tmax: rnd(d.tmax), tmin: rnd(d.tmin), pop: rnd(d.pop), mm: rnd1(d.precip),
      wind: rnd(d.wind), wind_dir: d.wind_dir || ''
    };
  });

  var upd = (input.updated || '');
  var updMs = Date.parse(upd);
  return {
    location: (input.location && input.location.name) || 'Cerdanyola del Vallès',
    updated: upd.slice(11, 16),
    stale: isNum(updMs) ? (Date.now() - updMs) > 4 * 3600 * 1000 : false,
    now: now,
    today: outDays[0] || null,
    days: outDays,
    rain: rain,
    rain_mm_24h: total_mm,
    sunrise: input.summary && input.summary.sunrise || '',
    sunset: input.summary && input.summary.sunset || '',
    series: {
      temp_hourly: next.map(function (h) { return [localMs(h.t), rnd1(h.temp)]; }),
      rain_hourly: next.map(function (h) { return [localMs(h.t), isNum(h.precip) ? rnd1(h.precip) : 0]; })
    }
  };
}
