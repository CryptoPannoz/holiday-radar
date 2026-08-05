/**
 * Esportazioni. Tutto viene generato nel browser: nessun file passa da un server.
 */

const CSV_COLUMNS = [
  'market',
  'market_name',
  'type',
  'start',
  'end',
  'nights',
  'name',
  'coverage_pct',
  'regions',
  'access',
  'drive_hours',
  'flight_km',
  'reachable_people',
];

/** Le celle si citano sempre: i nomi delle festività contengono virgole e accenti. */
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function toCSV(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map((col) => csvCell(r[col])).join(','));
  }
  // BOM: senza, Excel apre gli accenti come mojibake.
  return '﻿' + lines.join('\r\n');
}

const icsEscape = (text) =>
  String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

/** Le righe ICS oltre 75 ottetti vanno spezzate, altrimenti alcuni client scartano l'evento. */
function fold(line) {
  if (line.length <= 74) return line;
  const parts = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

const compact = (isoDate) => isoDate.replace(/-/g, '');

function nextDay(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function toICS(rows, { propertyLabel = 'property', stamp = new Date() } = {}) {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const out = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Holiday Radar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:Holiday Radar — ${icsEscape(propertyLabel)}`),
  ];

  rows.forEach((r, i) => {
    const summary = `${r.market} ${r.name}`;
    const details = [
      `${r.market_name} — ${r.type}`,
      r.regions ? `Regions: ${r.regions}` : '',
      r.coverage_pct ? `Share of country off: ${r.coverage_pct}%` : '',
      r.access ? `Access: ${r.access}` : '',
      r.reachable_people ? `Reachable people: ${r.reachable_people}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    out.push(
      'BEGIN:VEVENT',
      `UID:hr-${compact(r.start)}-${r.market}-${i}@holiday-radar`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compact(r.start)}`,
      // In ICS il DTEND di un evento all-day è esclusivo: senza +1 giorno l'ultimo giorno sparisce.
      `DTEND;VALUE=DATE:${compact(nextDay(r.end || r.start))}`,
      fold(`SUMMARY:${icsEscape(summary)}`),
      fold(`DESCRIPTION:${icsEscape(details)}`),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  });

  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

export function download(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (text) =>
  String(text || 'property')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'property';
