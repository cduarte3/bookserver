const express = require("express");
const router = express.Router();
const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const jwt = require('jsonwebtoken');

const client = new MongoClient(process.env.DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

router.use(cookieParser());

router.post("/", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Missing required fields: email, password" });
  }

  try {
    await client.connect();
    const collection = client.db("chapterchat").collection("users");
    const user = await collection.findOne({ email: email });
    if (user) {
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        const token = jwt.sign({ id: user._id }, process.env.SESSION_KEY, { expiresIn: '1h' });
        // Send token
        res.set('Authorization', `Bearer ${token}`).status(200).json({ id: user._id, token: token });
      } else {
        res.status(401).json({ message: "Invalid password" });
      }
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    await client.close();
  }
});

function getToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return null;
}

function isAuthenticated(req) {
  const token = getToken(req);
  if (!token) {
    return false;
  }

  try {
    // Verify the token using the same secret key used to sign the JWT
    const decoded = jwt.verify(token, process.env.SESSION_KEY);
    // Optionally, attach the decoded token to the request for further use
    req.user = decoded;
    return true;
  } catch (err) {
    // Token verification failed
    return false;
  }
}

module.exports = {router, isAuthenticated};