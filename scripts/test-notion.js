// scripts/test-notion.js
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

console.log('Has databases?', !!notion.databases);
console.log('Type of databases.query:', typeof notion.databases.query);

(async () => {
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
})();
