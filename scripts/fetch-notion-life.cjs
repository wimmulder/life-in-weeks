// scripts/fetch-notion-life.cjs
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const { NOTION_TOKEN, NOTION_DB_ID, DOB } = process.env;
if (!NOTION_TOKEN || !NOTION_DB_ID || !DOB) {
  console.error('Missing env vars. Required: NOTION_TOKEN, NOTION_DB_ID, DOB');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

function weekIndexFromDate(dobStr, dateStr) {
  // 0-based week index since DOB
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const dob = new Date(dobStr + 'T00:00:00Z');
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.floor((d - dob) / msPerWeek);
}

function toText(rich) {
  if (!rich || !Array.isArray(rich)) return '';
  return rich.map(s => s.plain_text || '').join('');
}

function getProp(page, name) {
  return page.properties?.[name] ?? null;
}

function extract(page) {
  const title = toText(getProp(page, 'Title')?.title);
  const date = getProp(page, 'Date')?.date?.start;
  const url = getProp(page, 'URL')?.url || page.url;
  const emoji = toText(getProp(page, 'Emoji')?.rich_text) || (page.icon?.emoji || '');
  const tagsProp = getProp(page, 'Tags');
  const tags = Array.isArray(tagsProp?.multi_select) ? tagsProp.multi_select.map(t => t.name) : [];
  const importanceProp = getProp(page, 'Importance');

  let importance = null;
  if (typeof importanceProp?.number === 'number') {
    importance = importanceProp.number;
  } else if (importanceProp?.select?.name) {
    const n = Number(importanceProp.select.name);
    importance = Number.isFinite(n) ? n : null;
  }

  const weekIndex = date ? weekIndexFromDate(DOB, date) : null;
  return { title, date, url, emoji, tags, importance, weekIndex };
}

async function fetchAll() {
  const results = [];
  let cursor;
  do {
    const resp = await notion.databases.query({
      database_id: NOTION_DB_ID,
      start_cursor: cursor,
      sorts: [{ property: 'Date', direction: 'ascending' }],
      page_size: 100,
    });
    resp.results.forEach(p => results.push(extract(p)));
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return results.filter(r => r.weekIndex !== null && r.title);
}

(async function main() {
  const events = await fetchAll();
  const byWeek = {};
  for (const ev of events) {
    (byWeek[ev.weekIndex] ||= []).push(ev);
  }

  const outDir = path.join(process.cwd(), '_data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'life.json');
  fs.writeFileSync(outFile, JSON.stringify({ eventsByWeek: byWeek }, null, 2));
  console.log(`Wrote ${outFile} with ${events.length} events in ${Object.keys(byWeek).length} weeks.`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});