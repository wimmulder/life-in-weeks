// filename: scripts/notion-to-netlify.js
// Poll Notion for edits and trigger a Netlify build via build hook when changes are detected.

import 'dotenv/config';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

/**
 * SECURITY
 * - Store NOTION_TOKEN, NOTION_DATABASE_ID, NETLIFY_BUILD_HOOK in GitHub repo secrets.
 *
 * BEHAVIOR
 * - Checks Notion DB sorted by last_edited_time.
 * - If any page edited since the last sync timestamp, POST to Netlify build hook.
 * - Debounces rapid edits by only triggering once per run.
 */

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NETLIFY_BUILD_HOOK = process.env.NETLIFY_BUILD_HOOK;

// Persist last sync timestamp in repo (safe, no secrets).
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

async function fetchLatestPages(limit = 50) {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sorts: [{ property: 'last_edited_time', direction: 'descending' }],
      page_size: limit
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Notion query failed: ${res.status} ${txt}`);
  }

  return await res.json();
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

  const data = await fetchLatestPages(50);

  // Identify updates since last sync
  const updated = data.results.filter(p => {
    const t = p.last_edited_time ? new Date(p.last_edited_time).getTime() : 0;
    return t > sinceTs;
  });

  if (updated.length > 0) {
    const latestEditedISO = data.results[0]?.last_edited_time || new Date().toISOString();
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