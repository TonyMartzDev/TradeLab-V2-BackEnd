const sqlite3 = require("sqlite3").verbose();

const DATABASE_PATH = "./trading_app.db";

const db = new sqlite3.Database(DATABASE_PATH, (err) => {
  if (err) {
    console.error("Error connecting to database:", err.message);
  } else {
    console.log("Connected to database");
  }
});

module.exports = db;
