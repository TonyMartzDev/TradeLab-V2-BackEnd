/* eslint-disable quotes */
// Import Jest testing functions
import {
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  it,
  expect,
  test,
} from "@jest/globals";

// Import functions to test and the user_repository module
import * as userRepository from "../user_repository.js";

// Destructure the functions we need for testing
const {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  createUserWithSettings,
  findSettingsByUserId,
} = userRepository;
// Import DB control functions and test DB path
import connectToDatabase, {
  initDB,
  closeDb,
  DATABASE_PATH as TEST_DB_PATH,
} from "../src/db/database_test_env";
import process from "process";

// Import Node.js file system module for cleanup
import fs from "fs/promises";

// Hashing simulation (replace with actual hashing later)
const simpleHash = (password) => `hashed_${password}`;

// Set environment to "test" BEFORE importing database potentially
process.env.NODE_ENV = "test";

describe("UserRepository Integration Tests", () => {
  let db;

  // Runs once before all tests in this block
  beforeAll(async () => {
    // Ensure the testDB file doesn't exist from previous runs
    try {
      console.log(`Attempting to delete old test DB: ${TEST_DB_PATH}`);
      await fs.unlink(TEST_DB_PATH);
      console.log("Old test DB deleted successfully.");
    } catch (error) {
      if (error.code !== "ENOENT") { // Ignore 'file not found' error
        console.error("Error deleting old test DB:", error);
        throw error; // Rethrow other errors
      }
      console.log("No old test DB found to delete.");
    }

    // Connect to the TEST database and initialize schema
    // NOTE: connectDb ensures connection is established and schema is initialized
    db = await connectToDatabase();
    console.log("Test DB connected successfully. Initializing schema...");
    await initDB();
    console.log("Test DB schema initialized successfully.");

    // Inject the test database connection into the user_repository module
    // This ensures all repository functions use our test database
    userRepository.setDatabaseConnection(db);
  });

  // Runs once after all tests in this block
  afterAll(async () => {
    await closeDb();
    // Delete the test DB file
    try {
      console.log(`Attempting to delete test DB: ${TEST_DB_PATH}`);
      await fs.unlink(TEST_DB_PATH);
      console.log("Test DB deleted after tests successfully.");
    } catch (error) {
      console.error("Error deleting test DB after tests:", error);
    }
  });

  // Runs before each test case
  beforeEach(async () => {
    // Clean tables before each test to ensure independence
    // Use await with Promises for db operations if not using serialize
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // Cascade delete on users should handle settings /sub_accounts if set up
        db.run(
          `
            DELETE FROM users;
            `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
        //If no cascade, delete explicitly in reverse order of creation
        db.run(
          `
            DELETE FROM sub_accounts;
            `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
        db.run(
          `
            DELETE FROM user_settings;
            `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
        db.run(
          `
            DELETE FROM trades;
            `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
        db.run(
          `
            VACUUM;
            `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });
  });

  // --- Test Cases ---

  test("should create a new user successfully", async () => {
    const userData = {
      username: "testuser1",
      email: "test1@example.com",
      password: "password123",
    };
    const passwordHash = simpleHash(userData.password);

    const userId = await createUser(
      userData.username,
      userData.email,
      passwordHash
    );

    expect(userId).toEqual(expect.any(Number)); // Should return a numeric ID

    // Verify user was actually inserted
    const foundUser = await findUserById(userId);
    expect(foundUser).not.toBeNull();
    expect(foundUser.id).toBe(userId);
    expect(foundUser.username).toBe(userData.username);
    expect(foundUser.email).toBe(userData.email);
    expect(foundUser.password_hash).toBe(passwordHash);
    expect(foundUser.created_at).toEqual(expect.any(String)); // Check if timestamp exists
  });

  test("should find a user by email", async () => {
    const userData = {
      username: "testuser2",
      email: "test2@example.com",
      password: "password123",
    };
    const passwordHash = simpleHash(userData.password);
    const userId = await createUser(
      userData.username,
      userData.email,
      passwordHash
    );

    const foundUser = await findUserByEmail(userData.email);
    expect(foundUser).not.toBeNull();
    expect(foundUser.id).toBe(userId);
    expect(foundUser.email).toBe(userData.email);
  });

  test("should return null when finding a non-existent user by email", async () => {
    const foundUser = await findUserByEmail("nonexistent@example.com");
    expect(foundUser).toBeNull();
  });

  test("should return null when finding a non-existent user by ID", async () => {
    const foundUser = await findUserById(99999); // Assuming 99999 doesn't exist
    expect(foundUser).toBeNull();
  });

  test("should throw error when creating user with duplicate email", async () => {
    const userData = {
      username: "testuser3",
      email: "duplicate@example.com",
      password: "password123",
    };
    await createUser(
      userData.username,
      userData.email,
      simpleHash(userData.password)
    );

    // Expect the second attempt with the same email to fail (reject the promise)
    // Note: The exact error message might vary based on SQLite version/constraints
    await expect(
      createUser("anotheruser", userData.email, simpleHash("otherpass"))
    ).rejects.toThrow(
      /SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email/i
    );
  });

  test("should throw error when creating user with duplicate username", async () => {
    const userData = {
      username: "duplicateuser",
      email: "user4@example.com",
      password: "password123",
    };
    await createUser(
      userData.username,
      userData.email,
      simpleHash(userData.password)
    );

    await expect(
      createUser(
        userData.username,
        "user5@example.com",
        simpleHash("otherpass")
      )
    ).rejects.toThrow(
      /SQLITE_CONSTRAINT: UNIQUE constraint failed: users.username/i
    );
  });

  test("should create user and settings within a transaction", async () => {
    const userData = {
      username: "testuserTx",
      email: "tx@example.com",
      password: "passwordTx",
    };
    const settings = { default_currency: "EUR", theme: "dark" };
    const passwordHash = simpleHash(userData.password);

    const userId = await createUserWithSettings(
      userData.username,
      userData.email,
      passwordHash,
      settings
    );

    expect(userId).toEqual(expect.any(Number));

    // Verify user exists
    const foundUser = await findUserById(userId);
    expect(foundUser).not.toBeNull();
    expect(foundUser.email).toBe(userData.email);

    // Verify settings exist
    const foundSettings = await findSettingsByUserId(userId);
    expect(foundSettings).not.toBeNull();
    expect(foundSettings.user_id).toBe(userId);
    expect(foundSettings.default_currency).toBe(settings.default_currency);
    expect(foundSettings.theme).toBe(settings.theme);
  });

  test("should rollback transaction if settings insertion fails", async () => {
    const userData = {
      username: "testuserRollback",
      email: "rollback@example.com",
      password: "passwordRb",
    };
    // Simulate invalid settings data that would violate a constraint
    // e.g., Try inserting settings with a NULL user_id manually or invalid theme
    // For simplicity, let's test by trying to create a user where the email will fail,
    // simulating a failure during the transaction process that should cause rollback.

    // First create a user that will cause the transaction to fail later
    await createUser(
      "existingUser",
      "fail_email@example.com",
      simpleHash("pass")
    );

    // Now attempt the transaction with the duplicate email
    const settings = { default_currency: "JPY", theme: "sepia" };
    await expect(
      createUserWithSettings(
        "newUser",
        "fail_email@example.com",
        simpleHash("newPass"),
        settings
      )
    ).rejects.toThrow(/SQLITE_CONSTRAINT/); // It should fail

    // IMPORTANT: Verify the user 'newUser' was NOT created due to rollback
    const foundUser = await findUserByEmail("fail_email@example.com");
    expect(foundUser).not.toBeNull();
    // Ensure the user found is the original one, not 'newUser' from the failed transaction
    expect(foundUser.username).toBe("existingUser");

    const shouldNotExistUser = await findUserByUsername("newUser");
    expect(shouldNotExistUser).toBeNull();
  });
});
