const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'urja_audit.db');
const db = new Database(dbPath);

// Enable Foreign Key constraints
db.pragma('foreign_keys = ON');

// Initialize schema if tables do not exist
function initDatabase() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Execute schema batch
  db.exec(schemaSql);
}

initDatabase();

module.exports = db;