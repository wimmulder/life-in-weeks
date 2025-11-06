// scripts/test-notion.cjs
const { Client } = require('@notionhq/client');

const { NOTION_TOKEN, NOTION_DB_ID } = process.env;

if (!NOTION_TOKEN || !NOTION_DB_ID) {
  console.error('Set NOTION_TOKEN and NOTION_DB_ID environment variables.');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

console.log('Has databases?', !!notion.databases);
console.log('Type of databases.query:', typeof notion.databases.query);

(async () => {
  try {
    const resp = await notion.databases.query({
      database_id: NOTION_DB_ID,
      page_size: 1,
    });
    console.log('Query OK. Results:', resp.results.length);
  } catch (err) {
    console.error('Query failed:', err);
    process.exit(1);
  }
})();