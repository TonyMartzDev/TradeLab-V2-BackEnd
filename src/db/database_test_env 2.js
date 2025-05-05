import sqlite3 from "sqlite3";
import fs from "fs";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import process from "process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine database path based on environment
const isTestEnvironment = process.env.NODE_ENV === "test";
const dbFileName = isTestEnvironment ? "trading_app_test.db" : "trading_app.db";
const DATABASE_PATH = path.join(__dirname, dbFileName);

console.log(`Using database path: ${DATABASE_PATH}`);

//Ensure the database file exists if in test mode (helps avoid certain errors)
// It will be created and deleted in tests anyway, but good practice
// If (isTestEnvironment && !fs.existsSync(DATABASE_PATH)) {
//   fs.writeFileSync(DATABASE_PATH, "");
// }

// Initialize database connection
let db = null;

// Function to establish connection (allow delay if needed)
function connectToDatabase() {
  // connectDb
  if (db) return db;

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DATABASE_PATH, (err) => {
      if (err) {
        console.error(
          `Error opening database at ${DATABASE_PATH}:`,
          err.message
        );
        db = null; // reset db if connection fails
        reject(err);
      } else {
        console.log(`Connected to the SQLite database: ${dbFileName}`);
        // Enable foreign keys for this connection
        db.run("PRAGMA foreign_keys = ON;", function (fkErr) {
          if (fkErr) {
            console.error("Error enabling foreign keys:", fkErr.message);
            reject(fkErr);
          } else {
            console.log("Foreign key support enabled");
          }
          resolve(db);
        });
      }
    });
  });
}

// Function to initialize the database schema (async version)
// Needs to be exported to be callable from tests
async function initDB() {
  const currentDb = await connectToDatabase(); // Ensure connection exists
  return new Promise((resolve, reject) => {
    currentDb.serialize(() => {
      console.log("Initializing database schema...");

      // --- IMPORTANT: Make sure your table creation uses correct syntax ---
      // --- Using strftime for ISO8601 timestamps as recommended ---

      // Create users table
      currentDb.run(
        `
             CREATE TABLE IF NOT EXISTS users (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               username TEXT UNIQUE NOT NULL, -- Added UNIQUE based on likely need
               email TEXT UNIQUE NOT NULL,
               password_hash TEXT NOT NULL,
               created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             );
           `,
        (err) => {
          if (err)
            return reject(
              new Error(`Users table creation failed: ${err.message}`)
            );
        }
      );
      // Indexes (add error handling if needed)
      currentDb.run(`
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
      currentDb.run(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

      // Create user_settings table (fixed columns version)
      currentDb.run(
        `
             CREATE TABLE IF NOT EXISTS user_settings (
               user_id INTEGER PRIMARY KEY NOT NULL,
               default_currency TEXT NOT NULL DEFAULT 'USD',
               theme TEXT NOT NULL DEFAULT 'light',
               created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
             );
           `,
        (err) => {
          if (err)
            return reject(
              new Error(`User settings table creation failed: ${err.message}`)
            );
        }
      );

      // Create sub_accounts table
      currentDb.run(
        `
             CREATE TABLE IF NOT EXISTS sub_accounts (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               user_id INTEGER NOT NULL,
               name TEXT NOT NULL,
               description TEXT,
               broker TEXT,
               created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               UNIQUE (user_id, name),
               FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
             );
           `,
        (err) => {
          if (err)
            return reject(
              new Error(`Sub accounts table creation failed: ${err.message}`)
            );
        }
      );
      currentDb.run(`
        CREATE INDEX IF NOT EXISTS idx_sub_accounts_user_id ON sub_accounts(user_id);`);

      // Create trades table (using ON DELETE SET NULL for sub_account_id if nullable)
      // ** Check if sub_account_id should be NULLABLE **
      const subAccountIdDefinition = "sub_account_id INTEGER"; // Change if NOT NULL
      const subAccountFkAction = "ON DELETE SET NULL"; // Change if NOT NULL / CASCADE
      currentDb.run(
        `
             CREATE TABLE IF NOT EXISTS trades (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               user_id INTEGER NOT NULL,
               ${subAccountIdDefinition},
               ticker TEXT NOT NULL,
               quantity REAL NOT NULL CHECK(quantity > 0),
               entry_price REAL NOT NULL,
               exit_price REAL,
               direction TEXT NOT NULL CHECK(direction IN ('long', 'short')),
               status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
               entry_date TEXT NOT NULL,
               exit_date TEXT,
               notes TEXT,
               commission REAL DEFAULT 0.0,
               created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
               FOREIGN KEY (sub_account_id) REFERENCES sub_accounts(id) ${subAccountFkAction}
             );
           `,
        (err) => {
          if (err)
            return reject(
              new Error(`Trades table creation failed: ${err.message}`)
            );
        }
      );
      // Indexes
      currentDb.run(`
        CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);`);
      currentDb.run(`
        CREATE INDEX IF NOT EXISTS idx_trades_sub_account_id ON trades(sub_account_id);`);
      currentDb.run(`
        CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);`);
      currentDb.run(`
        CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON trades(entry_date);`);
      currentDb.run(`
        CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);`);

      // Resolve the promise when all commands have likely been queued/run
      // Add error checking for crucial table creations above
      console.log("Database schema initialization attempt complete.");
      resolve();
    });
  });
}

// Function to close DB connection (needed for cleanup)
async function closeDb() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error("Error closing database:", err.message);
          reject(err);
        } else {
          console.log("Database connection closed.");
          db = null; // Reset db variable
          resolve();
        }
      });
    } else {
      resolve(); // No connection to close
    }
  });
}

export default connectToDatabase;
export { initDB, closeDb, DATABASE_PATH };
