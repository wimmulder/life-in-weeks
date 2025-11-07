// filename: scripts/notion-to-netlify.js
// ESM version. Poll Notion for edits and trigger a Netlify build via Netlify build hook.

import 'dotenv/config';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

/**
 * NOTES
 * - Notion DB queries cannot sort by the special page field "last_edited_time".
 *   We query without server-side sorts and sort client-side by page.last_edited_time.
 * - Secrets come from GitHub repository secrets via the workflow env.
 */

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NETLIFY_BUILD_HOOK = process.env.NETLIFY_BUILD_HOOK;

// Persist last sync timestamp in repo (safe; contains no secrets)
const STATE_DIR = '.cache';
const STATE_FILE = path.join(STATE_DIR, 'notion-last-sync.json');

function readLastSyncISO() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const { lastSyncISO } = JSON.parse(raw);
    return typeof lastSyncISO === 'string' ? lastSyncISO : null;
  } catch {
    return null;
  }
}

function writeLastSyncISO(iso) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastSyncISO: iso }, null, 2));
}

async function queryNotionPage(startCursor = null, pageSize = 100) {
  const body = { page_size: Math.min(pageSize, 100) };
  if (startCursor) body.start_cursor = startCursor;

  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Notion query failed: ${res.status} ${txt}`);
  }

  return await res.json();
}

async function fetchAllPages(maxItems = 1000) {
  let results = [];
  let cursor = null;

  while (results.length < maxItems) {
    const data = await queryNotionPage(cursor, 100);
    results = results.concat(data.results || []);
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return results;
}

async function triggerNetlifyBuild(reason) {
  const res = await fetch(NETLIFY_BUILD_HOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Include a small payload for traceability in Netlify logs
    body: JSON.stringify({ trigger_title: reason })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Netlify build trigger failed: ${res.status} ${txt}`);
  }
}

async function main() {
  if (!NOTION_TOKEN || !NOTION_DATABASE_ID || !NETLIFY_BUILD_HOOK) {
    throw new Error('Missing env: NOTION_TOKEN, NOTION_DATABASE_ID, NETLIFY_BUILD_HOOK');
  }

  const lastSyncISO = readLastSyncISO();
  const sinceTs = lastSyncISO ? new Date(lastSyncISO).getTime() : 0;

  // Fetch and sort client-side by last_edited_time (desc)
  const pages = await fetchAllPages(1000);
  const sorted = pages
    .filter(p => !!p.last_edited_time)
    .sort((a, b) => new Date(b.last_edited_time).getTime() - new Date(a.last_edited_time).getTime());

  const updated = sorted.filter(p => new Date(p.last_edited_time).getTime() > sinceTs);

  if (updated.length > 0) {
    const latestEditedISO = sorted[0]?.last_edited_time || new Date().toISOString();
    console.log(`Detected ${updated.length} Notion updates. Latest edit: ${latestEditedISO}`);
    await triggerNetlifyBuild(`Notion updates: ${updated.length}`);
    writeLastSyncISO(latestEditedISO);
    console.log('Build triggered and state updated.');
  } else {
    console.log('No Notion changes since last sync. Skipping build.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
