// scripts/notion-esm-test.mjs
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

console.log('Has databases?', !!notion.databases);
console.log('Type of databases.query:', typeof (notion.databases && notion.databases.query));

if (typeof (notion.databases && notion.databases.query) !== 'function') {
  console.error('databases.query missing. Dumping client:', notion);
  process.exit(1);
}

try {
  const resp = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID,
    page_size: 1,
  });
  console.log('Query OK. Results:', resp.results.length);
} catch (err) {
  console.error('Query failed:', err);
  process.exit(1);
}