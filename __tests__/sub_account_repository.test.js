// Import functions to test and the sub_account_repository module
import * as subAccountRepository from "../sub_account_repository.js";

// Destructure the functions we need for testing
const {
  createSubAccount,
  findSubAccountById,
  updateSubAccount,
  deleteSubAccount,
  findSubAccountsByUserId,
} = subAccountRepository;

// Import user repository module needed for setup
import * as userRepository from "../user_repository.js";

// Destructure the functions we need for testing
const { createUser } = userRepository;

//Import DB control functions (from test DB setup file)
import connectToDatabase, {
  initDB,
  closeDb,
  DATABASE_PATH as TEST_DB_PATH,
} from "../src/db/database_test_env";

// Import Node.js file system module for cleanup
import fs from "fs/promises";

// Import jests testing functions
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

describe("SubAccountRepository Integration Tests", () => {
  let db;
  let testUserId; // To store the ID of a user created for tests
   
  beforeAll(async () => {
    // --- Same setup as user_repository.test.js ---
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
    db = await connectToDatabase();
    console.log("Test DB connected successfully. Initializing schema...");
    await initDB();
    console.log("Test DB schema initialized successfully.");
    
    // Add a small delay to ensure all database operations are complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Inject the test database connection into both repository modules
    userRepository.setDatabaseConnection(db);
    subAccountRepository.setDatabaseConnection(db);
    
    // Create user for these tests
    testUserId = await createUser(
      "subAccUser",
      "subacc@example.com",
      simpleHash("password"),
    );
    if (!testUserId) {
      throw new Error("Failed to create test user for subaccounts tests");
    }
    console.log(`Created test user with ID: ${testUserId}`);
  });

  afterAll(async () => {
    await closeDb();

    // Delete test DB file
    try {
      console.log(`Attempting to delete test DB: ${TEST_DB_PATH}`);
      await fs.unlink(TEST_DB_PATH);
      console.log("Test DB deleted after tests successfully.");
    } catch (error) {
      console.error("Error deleting test DB after tests:", error);
    }
  });

  beforeEach(async () => {
    // Clean only sub_accounts before each test
    // User needs to persist across tests in this describe block
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("DELETE FROM sub_accounts", err => { if (err) reject(err); else resolve(); });
        // NOTE: If trades existed, might need 'DELETE FROM trades;' too depending on FKs
      });
    });
  });

  // --- Test Cases ---
  test("Should create a new sub-account successfully", async () => {
    const name = "My Algo Strategy";
    const description = "This is a test sub-account for algorithmic trading strategies.";

    const subAccountId = await createSubAccount(testUserId, name, description);
    expect(subAccountId).toEqual(expect.any(Number));

    // Verify insertion
    const foundSubAcc =  await findSubAccountById(subAccountId);
    expect(foundSubAcc).not.toBeNull();
    expect(foundSubAcc.id).toBe(subAccountId);
    expect(foundSubAcc.name).toBe(name);
    expect(foundSubAcc.description).toBe(description);
    expect(foundSubAcc.user_id).toBe(testUserId);
    expect(foundSubAcc.created_at).toEqual(expect.any(String));
  });

  test("Should find sub-account by user ID", async () => {
    // Create multiple sub-accounts for the user
    await createSubAccount(testUserId, "Account B", "Desc B");
    await createSubAccount(testUserId, "Account C", "Desc C");
    await createSubAccount(testUserId, "Account A", "Desc A");
    // Create an account for a different user (should not be found)
    const otherUserId = await createUser("otherUser", "other@example.com", simpleHash("pw"));
    await createSubAccount(otherUserId, "Other Account", "Other Desc");
    
    const userSubAccounts = await findSubAccountsByUserId(testUserId);

    expect(Array.isArray(userSubAccounts)).toBe(true);
    expect(userSubAccounts).toHaveLength(3);
    // Check if sorted by name ASC (as defined in repository function);
    expect(userSubAccounts[0].name).toBe("Account A");
    expect(userSubAccounts[1].name).toBe("Account B");
    expect(userSubAccounts[2].name).toBe("Account C");
    // Ensure all found accounts belong to the correct user
    userSubAccounts.forEach(account => {
      expect(account.user_id).toBe(testUserId);
    });
  });

  test("should return an empty array if user has not sub-accounts", async () => {
    const newUser = await createUser("noSubsUser", "noSubs@example.com", simpleHash("pw"));
    const userSubAccounts = await findSubAccountsByUserId(newUser);
    expect(userSubAccounts).toEqual([]);
  });

  test("Should throw error when creating sub-account with duplicate name for the same user", async () => {
    const duplicateName = "Duplicate Name Acc";
    await createSubAccount(testUserId, duplicateName);
    
    // Expect the second attempt with the same name for the same user to fail
    await expect(
      createSubAccount(testUserId, duplicateName),
    ).rejects.toThrow(
      /SQLITE_CONSTRAINT: UNIQUE constraint failed: sub_accounts.user_id, sub_accounts.name/i
    );
  });


  test("should allow creating sub-account with duplicate name for different users", async () => {
    const commonName = "Shared Name Acc";
    const otherUserId = await createUser("otherUser2", "other2@example.com", simpleHash("pw"));

    const subAccId1 = await createSubAccount(testUserId, commonName);
    const subAccId2 = await createSubAccount(otherUserId, commonName);

    expect(subAccId1).toEqual(expect.any(Number));
    expect(subAccId2).toEqual(expect.any(Number));
    expect(subAccId1).not.toBe(subAccId2); // Ensure they are different accounts
  });

  test("should update an existing sub-account", async () => {
    const originalName = "Original Name";
    const subAccountId = await createSubAccount(testUserId, originalName);
    
    // Add a small delay to ensure the timestamps will be different
    await new Promise((resolve) => setTimeout(resolve, 100));

    const updatedName = "Updated Name";
    const updatedDesc = "Updated Desc";
    const updatedBroker = "Updated Broker";

    const success = await updateSubAccount(subAccountId, updatedName, updatedDesc, updatedBroker);
    expect(success).toBe(true);

    // Verify update
    const foundSubAcc = await findSubAccountById(subAccountId);
    expect(foundSubAcc).not.toBeNull();
    expect(foundSubAcc.name).toBe(updatedName);
    expect(foundSubAcc.description).toBe(updatedDesc);
    expect(foundSubAcc.broker).toBe(updatedBroker);
    // Check if updated_at timestamp changed (crude check: not equal to created_at)
    expect(foundSubAcc.updated_at).not.toBe(foundSubAcc.created_at);
  });

  test("should return false when trying to update non-existent sub-account", async () => {
    const success = await updateSubAccount(99999, "NonExistentUpdate");
    expect(success).toBe(false);
  });

  test("should delete an existing sub-account", async () => {
    const nameToDelete = "To Be Deleted";
    const subAccountId = await createSubAccount(testUserId, nameToDelete);

    // Verify it exists first
    let foundSubAcc = await findSubAccountById(subAccountId);
    expect(foundSubAcc).not.toBeNull();

    // Delete it
    const success = await deleteSubAccount(subAccountId);
    expect(success).toBe(true);

    // Verify it's gone
    foundSubAcc = await findSubAccountById(subAccountId);
    expect(foundSubAcc).toBeNull();
  });

  test("should return false when trying to delete non-existent sub-account", async () => {
    const success = await deleteSubAccount(99999);
    expect(success).toBe(false);
  });

});
