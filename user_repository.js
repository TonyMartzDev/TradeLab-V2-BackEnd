import db from "./src/db/database.js";
import { connectToDatabase } from "./src/db/database_test_env.js";
import dbModule from "./src/db/database.js";

/**
 * Creates a new user in the database.
 * IMPORTANT: The password must be hashed before being passed to this function.
 * @param {string} username
 * @param {string} email
 * @param {string} passwordHash
 * @returns {Promise<number>} A promise that resolves to the ID of the newly created user.
 * @throws {Error} Throws an error if the user could not be created.
 */

function createUser(username, email, passwordHash) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();

    const sql = `
            INSERT INTO users (username, email, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `;

    const params = [username, email, passwordHash, now, now];

    db.run(sql, params, function (err) {
      if (err) {
        console.error("Error creating user:", err.message);
        reject(err);
      } else {
        console.log("User created with ID:", this.lastID);
        resolve(this.lastID);
      }
    });
  });
}

/**
 * Finds a user by their unique ID.
 * @param {number} id
 * @returns {Promise<object|null>} A promise that resolves with the user object if found, or null otherwise.
 * @throws {Error} Throws an error if the database query fails.
 */
function findUserById(id) {
  return new Promise((resolve, reject) => {
    const sql = `
    SELECT * FROM users WHERE id = ?`;
    const params = [id];

    // Use db.get to retrieve a single row
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error("Error finding user by ID:", err.message);
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
}

/**
 * Finds a user by their email address.
 * @param {string} email
 * @returns {Promise<object|null>} A promise that resolves with the user object if found, or null otherwise.
 * @throws {Error} Throws an error if the database query fails.
 */
function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const sql = `
    SELECT * FROM users WHERE email = ?`;
    const params = [email];

    // Use db.get as email should be unique
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error("Error finding user by email:", err.message);
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
}

/**
 * Creates a new user AND their default settings within a single transaction.
 * Rolls back all changes if any step fails.
 * IMPORTANT: The password MUST be hashed before calling this function.
 *
 * @param {string} username - The user's chosen username.
 * @param {string} email - The user's email address.
 * @param {string} passwordHash - The securely hashed password.
 * @param {object} defaultSettings - An object containing default settings (e.g., { default_currency: 'USD', theme: 'light' }).
 * @returns {Promise<number>} A promise that resolves with the ID of the newly created user if successful.
 * @throws {Error} Throws an error if the transaction fails.
 */
function createUserWithSettings(username, email, passwordHash, defaultSettings) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();

    // Begin transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION;', (err) => {
        if (err) {
          console.error("Error beginning transaction:", err.message);
          return reject(err); // Stop if we can't even begin
        }
      });

      // 1. Insert User
      const userSql = `
        INSERT INTO users (username, email, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `;
      const userParams = [username, email, passwordHash, now, now];

      // We need the user ID for the settings insert, so we use 'this.lastID'
      // in the callback of the user insert.
      db.run(userSql, userParams, function (userErr) {
        if (userErr) {
          console.error("Error inserting user during transaction:", userErr.message);
          // Rollback on error
          db.run('ROLLBACK;', () => reject(userErr));
          return; // Stop execution here
        }

        // Get the new user's ID
        const userId = this.lastID;
        console.log(`User inserted with ID: ${userId}`);

        // 2. Insert User Settings
        // Assuming user_settings table has user_id, default_currency, theme, created_at, updated_at
        const settingsSql = `
          INSERT INTO user_settings (user_id, default_currency, theme, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `;
        const settingsParams = [
          userId,
          defaultSettings.default_currency || 'USD', // Use provided or default
          defaultSettings.theme || 'light',         // Use provided or default
          now,
          now
        ];

        db.run(settingsSql, settingsParams, (settingsErr) => {
          if (settingsErr) {
            console.error("Error inserting user settings during transaction:", settingsErr.message);
            // Rollback on error
            db.run('ROLLBACK;', () => reject(settingsErr));
            return; // Stop execution here
          }

          console.log(`User settings inserted for user ID: ${userId}`);

          // 3. If both inserts succeeded, commit the transaction
          db.run('COMMIT;', (commitErr) => {
            if (commitErr) {
              console.error("Error committing transaction:", commitErr.message);
              // Try to rollback (though commit failing is tricky)
              db.run('ROLLBACK;', () => reject(commitErr));
            } else {
              console.log("Transaction committed successfully.");
              resolve(userId); // Resolve with the new user's ID
            }
          });
        });
      });
    });
  });
}

/**
 * Finds user settings by user ID.
 * @param {number} userId
 * @returns {Promise<object|null>} Settings object or null if not found.
 */
async function findSettingsByUserId(userId) {
  const db = await dbModule();
  return new Promise((resolve, reject) => {
    const sql = `
        SELECT * FROM user_settings WHERE user_id = ?`;
    db.get(sql, [userId], (err, row) => {
      if (err) {
        console.error("Error finding user settings by user ID:", err.message);
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
}

export { 
  createUser, 
  findUserById, 
  findUserByEmail, 
  createUserWithSettings,
  findSettingsByUserId,
};