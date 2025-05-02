import sqlite3 from "sqlite3";

const DATABASE_PATH = "src/db/trading_app.db";

const db = new sqlite3.Database(DATABASE_PATH, (err) => {
  if (err) {
    console.error("Error connecting to database:", err.message);
    throw err;
  } else {
    console.log("Connected to database");
  }
  initDB();
});

function initDB() {
  // using serializeing to ensure statements run sequentially
  db.serialize(() => {
    console.log("Initializing database schema");

    //Enable foreign key support (important for sqlite)
    db.run("PRAGMA foreign_keys = ON"),
      (err) => {
        if (err) {
          console.error("Error enabling foreign keys:", err.message);
          throw err;
        } else {
          console.log("Foreign keys enabled");
        }
      };
    // Create users table
    db.run(
      `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          email TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
      `,
      (err) => {
        if (err) {
          console.error("Error creating users table:", err.message);
          throw err;
        } else {
          console.log("Users table created");
        }
      }
    );
    db.run(
      `
        CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);`,
      (err) => {
        if (err) {
          console.error("Error creating users indexes:", err.message);
          throw err;
        } else {
          console.log("Users indexes created");
        }
      }
    );
    db.run(
      `
        CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
      `,
      (err) => {
        if (err) {
          console.error("Error creating users indexes:", err.message);
          throw err;
        } else {
          console.log("Users indexes created");
        }
      }
    );

    // Create user_settings table
    db.run(
      `
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id INTEGER PRIMARY KEY NOT NULL,
          default_currency TEXT NOT NULL DEFAULT 'USD',
          theme TEXT NOT NULL DEFAULT 'light',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );
      `,
      (err) => {
        if (err) {
          console.error("Error creating user_settings table:", err.message);
          throw err;
        } else {
          console.log("User_settings table created");
        }
      }
    );
    // Index on user_id is implicitly created by PRIMARY KEY

    //Create sub_accounts table
    db.run(
      `
        CREATE TABLE IF NOT EXISTS sub_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE (user_id, name),
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );
      `,
      (err) => {
        if (err) {
          console.error("Error creating sub_accounts table:", err.message);
          throw err;
        } else {
          console.log("Sub_accounts table created");
        }
      }
    );
    db.run(
      `
        CREATE INDEX IF NOT EXISTS idx_sub_accounts_user_id ON sub_accounts (user_id);
      `,
      (err) => {
        if (err) {
          console.error("Error creating sub_accounts indexes:", err.message);
          throw err;
        } else {
          console.log("Sub_accounts indexes created");
        }
      }
    );

    //Create trades table
    db.run(
      `
        CREATE TABLE IF NOT EXISTS trades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          sub_account_id INTEGER,
          ticker TEXT NOT NULL,
          quantity REAL NOT NULL CHECK (quantity > 0),
          entry_price REAL NOT NULL,
          exit_price REAL,
          direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
          entry_date TEXT NOT NULL,
          exit_date TEXT,
          notes TEXT,
          commission REAL DEFAULT 0.0,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (sub_account_id) REFERENCES sub_accounts(id) ON DELETE SET NULL
        );
      `,
      (err) => {
        if (err) {
          console.error("Error creating trades table:", err.message);
          throw err;
        } else {
          console.log("Trades table created");
        }
      }
    );

    // Add indexes for trades table
    db.run(
      `
        CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades (user_id);
      `,
      (err) => {
        if (err) {
          console.error("Error creating trades indexes:", err.message);
          throw err;
        }
      }
    );

    db.run(
      `
        CREATE INDEX IF NOT EXISTS idx_trades_sub_account_id ON trades (sub_account_id);`,
      (err) => {
        if (err) {
          console.error("Error creating trades indexes:", err.message);
          throw err;
        }
      }
    );

    db.run(
      `
        CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades (ticker);`,
      (err) => {
        if (err) {
          console.error("Error creating trades indexes:", err.message);
          throw err;
        }
      }
    );

    db.run(
      `
        CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON trades (entry_date);`,
      (err) => {
        if (err) {
          console.error("Error creating trades indexes:", err.message);
          throw err;
        }
      }
    );
    db.run(
      `
        CREATE INDEX IF NOT EXISTS idx_trades_status ON trades (status);`,
      (err) => {
        if (err) {
          console.error("Error creating trades indexes:", err.message);
          throw err;
        }
      }
    );

    console.log("Database schema initialization attempt completed");
  });
}

export default db;
