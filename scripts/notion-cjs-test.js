// scripts/notion-cjs-test.js
const pkg = require('@notionhq/client');        // import whole package
const { Client } = pkg;                          // extract Client from object

const notion = new Client({ auth: process.env.NOTION_TOKEN });

console.log('Has databases?', !!notion.databases);
console.log('Type of databases.query:', typeof (notion.databases && notion.databases.query));

if (!notion.databases || typeof notion.databases.query !== 'function') {
  console.error('databases.query not available. Import or version mismatch.');
  process.exit(1);
}

(async () => {
  const resp = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID,
    page_size: 1,
  });
  console.log('Query OK. Results:', resp.results.length);
})();