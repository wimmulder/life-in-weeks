// filename: scripts/export-notion-to-data.js
import 'dotenv/config';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DB_ID;
const DOB = process.env.DOB || null;
const NOTION_VERSION = '2022-06-28';

// Write to _data/life.json to match site.data.life
const OUTPUT_JSON = '_data/life.json';

function requireEnv(name, value) {
  if (!value || String(value).trim().length === 0) throw new Error(`Missing env: ${name}`);
}
requireEnv('NOTION_TOKEN', NOTION_TOKEN);
requireEnv('NOTION_DB_ID', NOTION_DB_ID);

async function query(startCursor = null) {
  const body = { page_size: 100 };
  if (startCursor) body.start_cursor = startCursor;

  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Notion query failed: ${res.status} ${txt}`);
  return JSON.parse(txt);
}

async function fetchAll() {
  const rows = [];
  let cursor = null;
  while (true) {
    const page = await query(cursor);
    rows.push(...(page.results || []));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return rows;
}

function getTitle(props) {
  return (props.Title?.title || []).map(t => t.plain_text).join(' ').trim();
}
function getDateISO(props) {
  return props.Date?.date?.start || null;
}
function getURL(props) {
  return props.URL?.url || '';
}
function getTags(props) {
  return (props.Tags?.multi_select || []).map(t => t.name);
}
function getPlace(props) {
  return props.Place?.place || null;
}

function deriveYear(dateISO) {
  return dateISO ? new Date(dateISO).getFullYear() : null;
}
function deriveAge(dateISO, dobISO) {
  if (!dateISO || !dobISO) return null;
  const dob = new Date(dobISO);
  const evt = new Date(dateISO);
  return Math.floor((evt - dob) / (365.25 * 24 * 60 * 60 * 1000));
}
function deriveWeekIndex(dateISO, dobISO) {
  if (!dateISO || !dobISO) return null;
  const dob = new Date(dobISO);
  const evt = new Date(dateISO);
  return Math.floor((evt - dob) / (7 * 24 * 60 * 60 * 1000)); // weeks since DOB
}

function mapEvent(page) {
  const props = page.properties || {};
  const title = getTitle(props);
  const date = getDateISO(props);
  const url = getURL(props);
  const tags = getTags(props);
  const place = getPlace(props);

  const year = deriveYear(date);
  const age = deriveAge(date, DOB);
  const weekIndex = deriveWeekIndex(date, DOB);

  return {
    id: page.id,
    last_edited_time: page.last_edited_time,
    title,
    notes: title,
    date,
    url,
    place,
    tags,
    year,
    age,
    weekIndex
  };
}

function groupByWeek(events) {
  const map = {};
  for (const e of events) {
    if (e.weekIndex === null || e.weekIndex === undefined) continue; // skip if missing date/DOB
    if (!map[e.weekIndex]) map[e.weekIndex] = [];
    map[e.weekIndex].push(e);
  }
  return map;
}

function writeJSON(pathOut, data) {
  fs.mkdirSync(path.dirname(pathOut), { recursive: true });
  fs.writeFileSync(pathOut, JSON.stringify(data, null, 2));
}

async function main() {
  console.log('Exporting Notion → _data/life.json for eventsByWeek...');
  if (!DOB) console.warn('Warning: DOB not set; weekIndex/age will be null.');

  const rows = await fetchAll();
  const events = rows.map(mapEvent);

  // Optional: sort within each week by date
  const eventsByWeek = groupByWeek(events);
  Object.values(eventsByWeek).forEach(arr => {
    arr.sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : 0;
      const bd = b.date ? new Date(b.date).getTime() : 0;
      return ad - bd;
    });
  });

  // Final shape to match site.data.life.eventsByWeek[key]
  const output = {
    eventsByWeek
  };

  writeJSON(OUTPUT_JSON, output);
  const weeksCount = Object.keys(eventsByWeek).length;
  const eventsCount = events.length;
  console.log(`Wrote ${eventsCount} events across ${weeksCount} weeks to ${OUTPUT_JSON}`);
}

main().catch(err => {
  console.error('Export failed:', err.stack || err.message);
  process.exit(1);
});
