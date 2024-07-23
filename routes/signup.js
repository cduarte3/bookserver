const express = require("express");
const router = express.Router();
const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");

const client = new MongoClient(process.env.DATABASE_URL);

router.post("/", async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res
      .status(400)
      .json({ message: "Missing required fields: email, username, password" });
  }

  try {
    await client.connect();
    const collection = client.db("chapterchat").collection("users");

    // check for existing email OR username
    const existingUser = await collection.findOne({
      $or: [{ email: email }, { username: username }],
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "Email or Username already in use" });
    }

    // Password hashing
    const salt = 10;
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await collection.insertOne({
      email: email,
      username: username,
      password: hashedPassword,
      books: [],
    });

    if (result.acknowledged) {
      res.status(200).json(result.insertedId);
      console.log(result.insertedId);
    } else {
      res.status(400).json({ message: "User not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    await client.close();
  }
});

module.exports = router;
