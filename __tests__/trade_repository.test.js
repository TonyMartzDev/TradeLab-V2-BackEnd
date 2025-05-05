// Import functions to test
import {
  createTrade,
  findTradeById,
  findOpenTradesByUserId,
  findClosedTradesByUserId,
  findTradesBySubAccountId,
  closeTrade,
  updateTradeDetails,
  deleteTrade,
  setDatabaseConnection,
} from "../trade_repository.js";

// Import setup functions
import { createUser, setDatabaseConnection as userSetDatabaseConnection } from "../user_repository.js";
import {
  createSubAccount,
  findSubAccountById,
  setDatabaseConnection as subAccountSetDatabaseConnection,
} from "../sub_account_repository.js"; // Need findSubAccountById for verification

// Import DB control functions (from your test DB setup file)
import connectDb, {
  initDB,
  closeDb,
  DATABASE_PATH as TEST_DB_PATH,
} from "../src/db/database_test_env.js"; // Adjusted path

// Import Node.js file system module for cleanup
import fs from "fs/promises";


//import jest global functions
import {
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  expect,
  test,
} from "@jest/globals";

// Hashing simulation
const simpleHash = (password) => `hashed_${password}`;

// Helper for dates - ensures consistency
const getISODate = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
};

describe("TradeRepository Integration Tests", () => {
  let db;
  let testUserId;
  let testSubAccountId;
  let otherUserId; // For testing isolation

  // Sample trade data generator
  const createSampleTradeData = (overrides = {}) => ({
    userId: testUserId,
    subAccountId: testSubAccountId,
    ticker: "TST",
    quantity: 10,
    entryPrice: 100.0,
    direction: "long",
    entryDate: getISODate(-1), // Yesterday
    notes: "Initial trade notes",
    commission: 1.99,
    ...overrides, // Allow overriding defaults
  });

  beforeAll(async () => {
    // --- Standard test DB setup ---
    try {
      console.log(`Attempting to delete old test DB: ${TEST_DB_PATH}`);
      await fs.unlink(TEST_DB_PATH);
      console.log("Old test DB deleted successfully.");
    } catch (err) {
      if (err.code !== "ENOENT") { // Ignore 'file not found' error
        console.error("Error deleting old test DB:", err);
        throw err; // Rethrow other errors
      }
      console.log("No old test DB found to delete.");
    }
    
    // Connect to the TEST database and initialize schema
    db = await connectDb();
    console.log("Test DB connected successfully. Initializing schema...");
    await initDB();
    console.log("Test DB schema initialized successfully.");
    
    // Add a small delay to ensure all database operations are complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Inject the test database connection into all repository modules
    setDatabaseConnection(db);
    userSetDatabaseConnection(db);
    subAccountSetDatabaseConnection(db);
    // --- End setup ---

    // Create persistent user and sub-account for these tests
    testUserId = await createUser(
      "tradeUser",
      "trade@example.com",
      simpleHash("password"),
    );
    otherUserId = await createUser(
      "otherTradeUser",
      "othertrade@example.com",
      simpleHash("password"),
    ); // For isolation tests
    testSubAccountId = await createSubAccount(
      testUserId,
      "Trade Test SubAcc",
      "Sub account for trade tests",
    );

    if (!testUserId || !testSubAccountId) {
      throw new Error(
        "Failed to create test user or sub-account for trade tests.",
      );
    }
    console.log(
      "Trade tests setup: UserID=<span class=\"math-inline\">\{testUserId\}, SubAccountID\=</span>{testSubAccountId}",
    );
  });

  afterAll(async () => {
    await closeDb();
    // Optional: delete test DB file
  });

  beforeEach(async () => {
    // Clean only trades before each test
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("DELETE FROM trades;", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });

  // --- Test Cases ---

  describe("createTrade", () => {
    test("should create a new open trade successfully", async () => {
      const tradeData = createSampleTradeData();
      const tradeId = await createTrade(tradeData);

      expect(tradeId).toEqual(expect.any(Number));

      const foundTrade = await findTradeById(tradeId);
      expect(foundTrade).not.toBeNull();
      expect(foundTrade.id).toBe(tradeId);
      expect(foundTrade.user_id).toBe(tradeData.userId);
      expect(foundTrade.sub_account_id).toBe(tradeData.subAccountId);
      expect(foundTrade.ticker).toBe(tradeData.ticker);
      expect(foundTrade.quantity).toBe(tradeData.quantity);
      expect(foundTrade.entry_price).toBe(tradeData.entryPrice);
      expect(foundTrade.direction).toBe(tradeData.direction);
      expect(foundTrade.entry_date).toBe(tradeData.entryDate);
      expect(foundTrade.status).toBe("open"); // Default
      expect(foundTrade.exit_price).toBeNull();
      expect(foundTrade.exit_date).toBeNull();
      expect(foundTrade.notes).toBe(tradeData.notes);
      expect(foundTrade.commission).toBe(tradeData.commission);
      expect(foundTrade.created_at).toEqual(expect.any(String));
      expect(foundTrade.updated_at).toEqual(expect.any(String));
    });

    test("should reject trade with quantity <= 0", async () => {
      const tradeData = createSampleTradeData({ quantity: 0 });
      await expect(createTrade(tradeData)).rejects.toThrow(
        /SQLITE_CONSTRAINT: CHECK constraint failed: quantity > 0/i,
      );

      const tradeDataNeg = createSampleTradeData({ quantity: -10 });
      await expect(createTrade(tradeDataNeg)).rejects.toThrow(
        /SQLITE_CONSTRAINT: CHECK constraint failed: quantity > 0/i,
      );
    });

    test("should reject trade with invalid direction", async () => {
      const tradeData = createSampleTradeData({ direction: "sideways" });
      await expect(createTrade(tradeData)).rejects.toThrow(
        /SQLITE_CONSTRAINT: CHECK constraint failed: direction IN \('long', 'short'\)/i,
      );
    });

    test("should reject trade with non-existent subAccountId", async () => {
      const tradeData = createSampleTradeData({ subAccountId: 9999 });
      await expect(createTrade(tradeData)).rejects.toThrow(
        /SQLITE_CONSTRAINT: FOREIGN KEY constraint failed/i,
      );
    });
    test("should reject trade with non-existent userId", async () => {
      const tradeData = createSampleTradeData({ userId: 9999 });
      await expect(createTrade(tradeData)).rejects.toThrow(
        /SQLITE_CONSTRAINT: FOREIGN KEY constraint failed/i,
      );
    });
  });

  describe("Read Operations", () => {
    let tradeId1, tradeId2, tradeIdClosed, otherUserTradeId;

    beforeEach(async () => {
      // Setup some trades for read tests
      tradeId1 = await createTrade(
        createSampleTradeData({ ticker: "RD1", entryDate: getISODate(-3) }),
      );
      tradeId2 = await createTrade(
        createSampleTradeData({ ticker: "RD2", entryDate: getISODate(-2) }),
      );
      tradeIdClosed = await createTrade(
        createSampleTradeData({
          ticker: "RD-CLOSED",
          entryDate: getISODate(-4),
        }),
      );
      await closeTrade({
        id: tradeIdClosed,
        exitPrice: 110,
        exitDate: getISODate(-1),
      }); // Close one trade
      otherUserTradeId = await createTrade(
        createSampleTradeData({ ticker: "OTHER", userId: otherUserId }),
      ); // Trade for another user
    });

    test("findTradeById should return correct trade", async () => {
      const found = await findTradeById(tradeId1);
      expect(found).not.toBeNull();
      expect(found.id).toBe(tradeId1);
      expect(found.ticker).toBe("RD1");
    });

    test("findTradeById should return null for non-existent ID", async () => {
      const found = await findTradeById(99999);
      expect(found).toBeNull();
    });

    test("findOpenTradesByUserId should return only open trades for the correct user", async () => {
      const openTrades = await findOpenTradesByUserId(testUserId);
      expect(openTrades).toHaveLength(2); // tradeId1, tradeId2
      expect(openTrades.map((t) => t.id).sort()).toEqual(
        [tradeId1, tradeId2].sort(),
      );
      expect(openTrades.every((t) => t.status === "open")).toBe(true);
      expect(openTrades.every((t) => t.user_id === testUserId)).toBe(true);
    });

    test("findClosedTradesByUserId should return only closed trades for the correct user", async () => {
      const closedTrades = await findClosedTradesByUserId(testUserId);
      expect(closedTrades).toHaveLength(1);
      expect(closedTrades[0].id).toBe(tradeIdClosed);
      expect(closedTrades[0].status).toBe("closed");
      expect(closedTrades[0].user_id).toBe(testUserId);
    });

    test("findClosedTradesByUserId should respect limit and offset", async () => {
      // Create more closed trades
      const closedId2 = await createTrade(
        createSampleTradeData({ ticker: "CLOSED2", entryDate: getISODate(-5) }),
      );
      await closeTrade({
        id: closedId2,
        exitPrice: 120,
        exitDate: getISODate(0),
      }); // Closed today
      const closedId3 = await createTrade(
        createSampleTradeData({ ticker: "CLOSED3", entryDate: getISODate(-6) }),
      );
      await closeTrade({
        id: closedId3,
        exitPrice: 130,
        exitDate: getISODate(-2),
      }); // Closed day before yesterday

      // Fetch page 1 (limit 2) - should be closedId2, tradeIdClosed (sorted by exit_date DESC)
      const page1 = await findClosedTradesByUserId(testUserId, 2, 0);
      expect(page1).toHaveLength(2);
      expect(page1[0].id).toBe(closedId2); // Exited latest
      expect(page1[1].id).toBe(tradeIdClosed); // Exited next latest

      // Fetch page 2 (limit 2, offset 2) - should be closedId3
      const page2 = await findClosedTradesByUserId(testUserId, 2, 2);
      expect(page2).toHaveLength(1);
      expect(page2[0].id).toBe(closedId3);
    });

    test("findTradesBySubAccountId should return only trades for that sub-account", async () => {
      // Create another sub-account and a trade in it
      const otherSubAccId = await createSubAccount(testUserId, "Other SubAcc");
      const tradeInOtherSubAcc = await createTrade(
        createSampleTradeData({
          subAccountId: otherSubAccId,
          ticker: "OTHER_SUB",
        }),
      );

      const trades = await findTradesBySubAccountId(testSubAccountId);
      // Should include tradeId1, tradeId2, tradeIdClosed
      expect(trades).toHaveLength(3);
      expect(trades.map((t) => t.id).sort()).toEqual(
        [tradeId1, tradeId2, tradeIdClosed].sort(),
      );
      expect(trades.every((t) => t.sub_account_id === testSubAccountId)).toBe(
        true,
      );

      const otherTrades = await findTradesBySubAccountId(otherSubAccId);
      expect(otherTrades).toHaveLength(1);
      expect(otherTrades[0].id).toBe(tradeInOtherSubAcc);
    });
  });

  describe("closeTrade", () => {
    let openTradeId;
    beforeEach(async () => {
      openTradeId = await createTrade(
        createSampleTradeData({ ticker: "CLOSE_ME" }),
      );
    });

    test("should close an open trade successfully", async () => {
      const exitPrice = 115.0;
      const exitDate = getISODate(0); // Today

      const success = await closeTrade({
        id: openTradeId,
        exitPrice,
        exitDate,
      });
      expect(success).toBe(true);

      const closedTrade = await findTradeById(openTradeId);
      expect(closedTrade.status).toBe("closed");
      expect(closedTrade.exit_price).toBe(exitPrice);
      expect(closedTrade.exit_date).toBe(exitDate);
      expect(closedTrade.updated_at).not.toBe(closedTrade.created_at);
    });

    test("should update notes and commission when closing", async () => {
      const exitPrice = 115.0;
      const exitDate = getISODate(0);
      const exitNotes = "Closed successfully";
      const exitCommission = 2.5;

      const success = await closeTrade({
        id: openTradeId,
        exitPrice,
        exitDate,
        notes: exitNotes,
        commission: exitCommission,
      });
      expect(success).toBe(true);

      const closedTrade = await findTradeById(openTradeId);
      expect(closedTrade.status).toBe("closed");
      expect(closedTrade.exit_price).toBe(exitPrice);
      expect(closedTrade.exit_date).toBe(exitDate);
      expect(closedTrade.notes).toBe(exitNotes);
      expect(closedTrade.commission).toBe(exitCommission); // Assumes commission adds up or overwrites based on your logic needs
    });

    test("should return false when trying to close an already closed trade", async () => {
      // Close it once
      await closeTrade({
        id: openTradeId,
        exitPrice: 110,
        exitDate: getISODate(0),
      });
      // Try to close again
      const success = await closeTrade({
        id: openTradeId,
        exitPrice: 120,
        exitDate: getISODate(1),
      });
      expect(success).toBe(false); // Should fail because WHERE clause includes "status = 'open'"
    });

    test("should return false when trying to close non-existent trade", async () => {
      const success = await closeTrade({
        id: 9999,
        exitPrice: 100,
        exitDate: getISODate(0),
      });
      expect(success).toBe(false);
    });
  });

  describe("updateTradeDetails", () => {
    let tradeId;
    beforeEach(async () => {
      tradeId = await createTrade(
        createSampleTradeData({
          ticker: "UPDATE_ME",
          notes: "Original",
          commission: 1.0,
        }),
      );
    });

    test("should update notes successfully", async () => {
      // Add a small delay to ensure updated_at will be different from created_at
      await new Promise((resolve) => setTimeout(resolve, 10));
      
      const newNotes = "Updated notes";
      const success = await updateTradeDetails(tradeId, { notes: newNotes });
      expect(success).toBe(true);
      const updatedTrade = await findTradeById(tradeId);
      expect(updatedTrade.notes).toBe(newNotes);
      expect(updatedTrade.commission).toBe(1.0); // Commission unchanged
      expect(updatedTrade.updated_at).not.toBe(updatedTrade.created_at);
    });

    test("should update commission successfully", async () => {
      const newCommission = 5.0;
      const success = await updateTradeDetails(tradeId, {
        commission: newCommission,
      });
      expect(success).toBe(true);
      const updatedTrade = await findTradeById(tradeId);
      expect(updatedTrade.notes).toBe("Original"); // Notes unchanged
      expect(updatedTrade.commission).toBe(newCommission);
      expect(updatedTrade.updated_at).not.toBe(updatedTrade.created_at);
    });

    test("should update notes and commission simultaneously", async () => {
      const newNotes = "Both updated";
      const newCommission = 7.5;
      const success = await updateTradeDetails(tradeId, {
        notes: newNotes,
        commission: newCommission,
      });
      expect(success).toBe(true);
      const updatedTrade = await findTradeById(tradeId);
      expect(updatedTrade.notes).toBe(newNotes);
      expect(updatedTrade.commission).toBe(newCommission);
    });

    test("should return false if no updates are provided", async () => {
      const success = await updateTradeDetails(tradeId, {});
      expect(success).toBe(false);
    });

    test("should update details of a closed trade", async () => {
      await closeTrade({
        id: tradeId,
        exitPrice: 100,
        exitDate: getISODate(0),
      });
      const newNotes = "Updating closed trade notes";
      const success = await updateTradeDetails(tradeId, { notes: newNotes });
      expect(success).toBe(true);
      const updatedTrade = await findTradeById(tradeId);
      expect(updatedTrade.notes).toBe(newNotes);
      expect(updatedTrade.status).toBe("closed"); // Still closed
    });
  });

  describe("deleteTrade", () => {
    let tradeId;
    beforeEach(async () => {
      tradeId = await createTrade(
        createSampleTradeData({ ticker: "DELETE_ME" }),
      );
    });

    test("should delete a trade successfully", async () => {
      const success = await deleteTrade(tradeId);
      expect(success).toBe(true);
      const found = await findTradeById(tradeId);
      expect(found).toBeNull();
    });

    test("should return false when trying to delete non-existent trade", async () => {
      const success = await deleteTrade(99999);
      expect(success).toBe(false);
    });
  });
});
