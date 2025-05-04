// Import the database connection based on environment
import process from "process";

// Dynamically import the appropriate database connection based on environment
let db;
if (process.env.NODE_ENV === "test") {
  // For test environment, we'll use the database connection passed to the test
  // The actual db instance will be set during test setup
  db = null;
} else {
  // For non-test environments, import the regular database
  // Using a dynamic import would be better, but for simplicity we'll use a require-like approach
  const dbModule = await import("./src/db/database_test_env.js");
  db = dbModule.default;
}

/**
 * Sets the database connection to use for all repository functions.
 * This is primarily used for testing to inject a test database.
 * @param {Object} database - The database connection to use
 */
function setDatabaseConnection(database) {
  db = database;
}

/**
 * Creates a new sub-account for a given user.
 * @param {number} userId - The ID of the user owning this sub-account.
 * @param {string} name - The name of the sub-account (e.g., IBKR Algo).
 * @param {string} description - Optional description of the sub-account.
 * @returns {Promise<number>} A promise that resolves with the ID of the newly created sub-account.
 * @throws {Error} Throws an error if insertion fails (e.g., unique name constraint violation).
 */
function createSubAccount(userId, name, description = null) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const sql = `
      INSERT INTO sub_accounts (user_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = [userId, name, description, now, now];
    db.run(sql, params, function (err) {
      if (err) {
        console.error("Error creating sub-account:", err.message);
        reject(err);
      } else {
        console.log("Sub-account created with ID:", this.lastID);
        resolve(this.lastID);
      }
    });
  });
}

/**
 * Finds all sub-accounts belonging to a specific user.
 * 
 * @param {number} userId - The ID of the user whose sub-accounts are to be retrieved.
 * @returns {Promise<Array>} A promise that resolves with an array of sub-account objects (empty array if none found).
 * @throws {Error} Throws an error if the database query fails.
 */
function findSubAccountsByUserId(userId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM sub_accounts WHERE user_id = ? ORDER BY name ASC
    `;
    const params = [userId];

    // Use db.all as we expect multiple rows
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error("Error finding sub-accounts by user ID:", err.message);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Finds a single sub-account by its unique ID.
 * 
 * @param {number} id - The ID of the sub-account to retrieve.
 * @returns {Promise<object|null>} A promise that resolves with the sub-account object if found, or null otherwise.
 * @throws {Error} Throws an error if the database query fails.
 */
function findSubAccountById(id) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM sub_accounts WHERE id = ?
    `;
    const params = [id];

    // Use db.get as we expect a single row
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error("Error finding sub-account by ID:", err.message);
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
}

/**
 * Updates an existing sub-account's details.
 * 
 * @param {number} id - The ID of the sub-account to update.
 * @param {string} name - The new name for the sub-account.
 * @param {string} description - The new description for the sub-account.
 * @param {string} broker - The new broker for the sub-account.
 * @returns {Promise<boolean>} A promise that resolves with true if the update was successful (row updated), or false otherwise.
 * @throws {Error} Throws an error if the update fails.
 */
function updateSubAccount(id, name, description = null, broker = null) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const sql = `
      UPDATE sub_accounts
      SET name = ?, description = ?, broker = ?, updated_at = ?
      WHERE id = ?
    `;
    const params = [name, description, broker, now, id];
    db.run(sql, params, function (err) {
      if (err) {
        console.error("Error updating sub-account:", err.message);
        reject(err);
      } else {
        console.log("Rows updated:", this.changes);
        resolve(this.changes > 0);
      }
    });
  });
}

/**
 * Deletes a sub-account by its unique ID.
 * Note: Consequences depend on the FOREIGN KEY constraint in the 'trades' table.
 * - ON DELETE CASCADE: Associated trades will also be deleted.
 * - ON DELETE SET NULL: Associated trades will have their sub_account_id set to NULL (requires nullable column).
 * - No clause / NOT NULL: Deletion might fail if trades reference this sub-account.
 * 
 * @param {number} id - The ID of the sub-account to delete.
 * @returns {Promise<boolean>} A promise that resolves with true if the deletion was successful (row deleted), or false otherwise.
 * @throws {Error} Throws an error if the deletion fails.
 */
function deleteSubAccount(id) {
  return new Promise((resolve, reject) => {
    const sql = `
      DELETE FROM sub_accounts WHERE id = ?
    `;
    const params = [id];
    db.run(sql, params, function (err) {
      if (err) {
        console.error("Error deleting sub-account:", err.message);
        reject(err);
      } else {
        console.log("Rows deleted:", this.changes);
        resolve(this.changes > 0);
      }
    });
  });
}

export { 
  createSubAccount, 
  findSubAccountsByUserId, 
  findSubAccountById, 
  updateSubAccount, 
  deleteSubAccount,
  setDatabaseConnection, // Export the function to set the database connection
};

