import { createUserWithSettings, findUserById, findUserByEmail } from "./user_repository.js";

async function main() {
  const username = "testuser";
  const email = "testuser@example.com";
  const passwordHash = "testpasswordhash";

  const userId = await createUserWithSettings(
    username,
    email,
    passwordHash,
    { default_currency: "USD", theme: "dark" }
  );
  console.log("User created with ID:", userId);

  const user = await findUserById(userId);
  console.log("User found:", user);

  const userByEmail = await findUserByEmail(email);
  console.log("User found by email:", userByEmail);
}

main();