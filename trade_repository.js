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
 * Creates a new trade record (defaults to 'open' status)
 * 
 * @param {object} tradeData - Object containing trade details.
 * @param {number} tradeData.userId - The ID of the user making the trade.
 * @param {number} tradeData.subAccountId - The ID of the sub-account associated with the trade.
 * @param {string} tradeData.ticker - The ticker symbol traded (e.g., 'AAPL').
 * @param {number} tradeData.quantity - The number of shares (must be > 0).
 * @param {number} tradeData.entryPrice - The entry price of the trade.
 * @param {string} tradeData.direction - The direction of the trade ('long' or 'short').
 * @param {string} tradeData.entryDate - Timestamp (ISO 8601 format) of entry.
 * @param {string} [tradeData.exitDate] - Timestamp (ISO 8601 format) of exit.
 * @param {number} [tradeData.exitPrice] - The exit price of the trade.
 * @param {string} [tradeData.notes] - Optional notes for the trade.
 * @param {number} [tradeData.commission] - Optional commission for the trade.
 * @param {string} [tradeData.status] - The status of the trade ('open' or 'closed').
 * @returns {Promise<number>} A promise that resolves with the ID of the newly created trade.
 * @throws {Error} Throws an error if the trade could not be created.
 */
function createTrade(tradeData) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const sql = `
      INSERT INTO trades (
        user_id,
        sub_account_id,
        ticker,
        quantity,
        entry_price,
        direction,
        entry_date,
        exit_date,
        exit_price,
        notes,
        commission,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      tradeData.userId,
      tradeData.subAccountId,
      tradeData.ticker,
      tradeData.quantity,
      tradeData.entryPrice,
      tradeData.direction,
      tradeData.entryDate,
      tradeData.exitDate,
      tradeData.exitPrice,
      tradeData.notes,
      tradeData.commission,
      tradeData.status || "open",
      now,
      now,
    ];
    db.run(sql, params, function (err) {
      if (err) {
        console.error("Error creating trade:", err.message);
        reject(err);
      } else {
        console.log("Trade created with ID:", this.lastID);
        resolve(this.lastID);
      }
    });
  });
}

/**
 * Finds a single trade by its unique ID.
 * 
 * @param {number} id - The ID of the trade to find.
 * @returns {Promise<object|null>} A promise that resolves with the trade object if found, or null otherwise.
 * @throws {Error} Throws an error if the database query fails.
 */
function findTradeById(id) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM trades WHERE id = ?
    `;
    const params = [id];

    // Use db.get as we expect a single row
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error("Error finding trade by ID:", err.message);
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
}

/**
 * Finds all open trades for a specific user.
 * 
 * @param {number} userId - The ID of the user whose open trades are to be retrieved.
 * @returns {Promise<Array>} A promise that resolves with an array of open trade objects (empty array if none found).
 * @throws {Error} Throws an error if the database query fails.
 */
function findOpenTradesByUserId(userId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM trades WHERE user_id = ? AND status = 'open' ORDER BY entry_date ASC
    `;
    const params = [userId];

    // Use db.all as we expect multiple rows
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error("Error finding open trades by user ID:", err.message);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Finds closed trades for a specific user., with optional pagination.
 * 
 * @param {number} userId - The ID of the user whose closed trades are to be retrieved.
 * @param {number} [limit=50] - The maximum number of trades to retrieve (default: 50).
 * @param {number} [offset=0] - The number of trades to skip (for pagination) before starting to retrieve (default: 0).
 * @returns {Promise<Array>} A promise that resolves with an array of closed trade objects (empty array if none found).
 * @throws {Error} Throws an error if the database query fails.
 */
function findClosedTradesByUserId(userId, limit = 50, offset = 0) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM trades 
      WHERE user_id = ? AND status = 'closed' 
      ORDER BY exit_date DESC,
      entry_date DESC
      LIMIT ? OFFSET ?
    `;
    const params = [userId, limit, offset];

    // Use db.all as we expect multiple rows
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error("Error finding closed trades by user ID:", err.message);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Finds trades for a specific sub-account, with optional pagination.
 * 
 * @param {number} subAccountId - The ID of the sub-account whose trades are to be retrieved.
 * @param {number} [limit=50] - The maximum number of trades to retrieve (default: 50).
 * @param {number} [offset=0] - The number of trades to skip (for pagination) before starting to retrieve (default: 0).
 * @returns {Promise<Array>} A promise that resolves with an array of trade objects (empty array if none found).
 * @throws {Error} Throws an error if the database query fails.
 */
function findTradesBySubAccountId(subAccountId, limit = 50, offset = 0) {
  return new Promise((resolve, reject) => {
    // Get the user_id associated with this sub-account first
    const findSubAccountSql = `
      SELECT user_id FROM sub_accounts WHERE id = ?
    `;
    
    db.get(findSubAccountSql, [subAccountId], (err, subAccount) => {
      if (err) {
        console.error("Error finding sub-account:", err.message);
        reject(err);
        return;
      }
      
      if (!subAccount) {
        // Sub-account not found, return empty array
        resolve([]);
        return;
      }
      
      const userId = subAccount.user_id;
      
      const sql = `
        SELECT * FROM trades 
        WHERE sub_account_id = ? AND user_id = ?
        ORDER BY exit_date DESC,
        entry_date DESC
        LIMIT ? OFFSET ?
      `;
      const params = [subAccountId, userId, limit, offset];

      // Use db.all as we expect multiple rows
      db.all(sql, params, (err, rows) => {
        if (err) {
          console.error("Error finding trades by sub-account ID:", err.message);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  });
}

/**
 * Closes an open trade by setting exit price, exit date and status.
 * 
 * @param {object} closeData - Object for closing a trade.
 * @param {number} closeData.id - The ID of the trade to close.
 * @param {number} closeData.exitPrice - The exit price of the trade.
 * @param {string} closeData.exitDate - The exit date of the trade.
 * @param {string|null} [closedData.notes=undefined] - Optional updated noted (undefined keeps existing notes)
 * @param {number|null} [closedData.commission=undefined] - Optional updated commission (undefined keeps existing commission)
 * @returns {Promise<boolean>} A promise that resolves with true if the trade was successfully closed, or false otherwise. (e.g., already closed or not found)
 * @throws {Error} Throws an error if the trade could not be closed.
 */
function closeTrade(closeData) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    // Use COALESCE to update notes/commission only if  a new value is provided
    const sql = `
      UPDATE trades
      SET exit_price = ?,
        exit_date = ?,
        status = 'closed',
        updated_at = ?,
        notes = COALESCE(?, notes),
        commission = COALESCE(?, commission)
      WHERE id = ? and status = 'open'
    `;
    const params = [
      closeData.exitPrice,
      closeData.exitDate,
      now,
      closeData.notes,
      closeData.commission,
      closeData.id,
    ];
    db.run(sql, params, function (err) {
      if (err) {
        console.error("Error closing trade:", err.message);
        reject(err);
      } else {
        console.log(`Attempted to close trade with ID: ${closeData.id}. 
            Rows affected: ${this.changes}`);
        resolve(this.changes > 0);
      }
    });
  });
}

/**
 * Updates notes and/or commission for a specific trade.
 * 
 * @param {number} id - The ID of the trade to update.
 * @param {object} updates - Object containing fiels to update.
 * @param {string} [updates.notes] -  New notes (optional)
 * @param {number} [updates.commission] - New commission (optional)
 * @returns {Promise<boolean>} A promise that resolves with true if the trade was successfully updated, or false otherwise. (e.g., not found)
 * @throws {Error} Throws an error if the trade could not be updated.
 */
function updateTradeDetails(id, {notes=undefined, commission=undefined}) {
  //only proceed if there is something to update
  if (notes === undefined && commission === undefined) {
    return Promise.resolve(false); // nothing to update
  }
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const fieldsToUpdate = [];
    const params = [];

    // Add updated_at first to ensure it's always included
    fieldsToUpdate.push("updated_at = ?");
    params.push(now);
    
    if (notes !== undefined) {
      fieldsToUpdate.push("notes = ?");
      params.push(notes);
    }
    if (commission !== undefined) {
      fieldsToUpdate.push("commission = ?");
      params.push(commission);
    }
    
    // Add the ID parameter last
    params.push(id);
    const sql = `
      UPDATE trades
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = ?
    `;
    db.run(sql, params, function (err) {
      if (err) {
        console.error("Error updating trade details:", err.message);
        reject(err);
      } else {
        console.log(`Updated details for trade with ID: ${id}. 
            Rows affected: ${this.changes}`);
        resolve(this.changes > 0);
      }
    });
  });
}

/**
 * Deletes a trade by its ID. USE WITH CAUTION!
 * 
 * @param {number} id - The ID of the trade to delete.
 * @returns {Promise<boolean>} A promise that resolves with true if the trade was successfully deleted, or false otherwise. (e.g., not found)
 * @throws {Error} Throws an error if the trade could not be deleted.
 */
function deleteTrade(id) {
  return new Promise((resolve, reject) => {
    const sql = `
    DELETE FROM trades
    WHERE id = ?`;
    const params = [id];
    db.run(sql, params, function (err) {
      if (err) {
        console.error("Error deleting trade:", err.message);
        reject(err);
      } else {
        console.log(`Deleted trade with ID: ${id}. 
            Rows affected: ${this.changes}`);
        resolve(this.changes > 0);
      }
    });
  });
}

export {
  createTrade,
  findOpenTradesByUserId,
  findClosedTradesByUserId,
  findTradesBySubAccountId,
  closeTrade,
  updateTradeDetails,
  deleteTrade,
  findTradeById,
  setDatabaseConnection,
};