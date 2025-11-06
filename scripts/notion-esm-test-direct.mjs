// scripts/notion-esm-test-direct.mjs
import { Client } from '@notionhq/client/build/src/index.js'; // direct ESM entry

const notion = new Client({ auth: process.env.NOTION_TOKEN });

console.log('Has databases?', !!notion.databases);
console.log('Type of databases.query:', typeof (notion.databases && notion.databases.query));

if (typeof (notion.databases && notion.databases.query) !== 'function') {
  console.error('databases.query still missing — check version and install.');
  process.exit(1);
}

const resp = await notion.databases.query({
  database_id: process.env.NOTION_DB_ID,
  page_size: 1,
});
console.log('Query OK. Results:', resp.results.length);
