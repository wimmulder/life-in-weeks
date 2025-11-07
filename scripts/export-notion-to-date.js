// filename: scripts/export-notion-to-data.js
// Exports a Notion database to Jekyll _data as JSON or YAML.
// Uses Netlify environment variables: NOTION_TOKEN, NOTION_DB_ID

import 'dotenv/config';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DB_ID; // Netlify env name
const OUTPUT_JSON = '_data/life_in_weeks.json'; // adjust if you prefer YAML
const NOTION_VERSION = '2022-06-28';

function requireEnv(name, value) {
  if (!value || String(value).trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

requireEnv('NOTION_TOKEN', NOTION_TOKEN);
requireEnv('NOTION_DB_ID', NOTION_DB_ID);

async function queryPage(startCursor = null, pageSize = 100) {
  const body = { page_size: Math.min(pageSize, 100) };
  if (startCursor) body.start_cursor = startCursor;

  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`Notion query failed: ${res.status} ${txt}`);
  }
  return JSON.parse(txt);
}

async function fetchAllRows(maxItems = 2000) {
  const rows = [];
  let cursor = null;

  while (rows.length < maxItems) {
    const page = await queryPage(cursor, 100);
    rows.push(...(page.results || []));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }

  return rows;
}

// Map Notion properties to a simple object your template expects.
// Adjust property names to match your Notion schema.
function mapRow(page) {
  const props = page.properties || {};
  const getTitle = () => {
    const title = props.Name?.title?.[0]?.plain_text;
    return title || '';
  };
  const getNumber = (p) => {
    const num = props[p]?.number;
    return typeof num === 'number' ? num : null;
  };
  const getRichText = (p) => {
    const rts = props[p]?.rich_text || [];
    return rts.map((rt) => rt.plain_text).join(' ').trim();
  };

  return {
    id: page.id,
    last_edited_time: page.last_edited_time,
    title: getTitle(),
    year: getNumber('Year'),
    age: getNumber('Age'),
    notes: getRichText('Notes'),
  };
}

function writeJSON(pathOut, data) {
  fs.mkdirSync(path.dirname(pathOut), { recursive: true });
  fs.writeFileSync(pathOut, JSON.stringify(data, null, 2));
}

async function main() {
  console.log('Exporting Notion database to Jekyll data...');
  console.log(`NOTION_DB_ID: ${NOTION_DB_ID}`);
  const rows = await fetchAllRows(2000);
  const mapped = rows.map(mapRow);

  // Optional: sort for stable output (e.g., by year then age, fallback last_edited_time)
  mapped.sort((a, b) => {
    const ya = a.year ?? 0;
    const yb = b.year ?? 0;
    if (ya !== yb) return ya - yb;
    const aa = a.age ?? 0;
    const ab = b.age ?? 0;
    if (aa !== ab) return aa - ab;
    return new Date(a.last_edited_time) - new Date(b.last_edited_time);
  });

  writeJSON(OUTPUT_JSON, mapped);
  console.log(`Wrote ${mapped.length} rows to ${OUTPUT_JSON}`);
}

main().catch((err) => {
  console.error('Export failed:', err.message);
  // Surface a meaningful error to Netlify
  process.exit(1);
});