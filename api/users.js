const express = require("express");
const router = express.Router();
const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.DATABASE_URL);

router.get("/", async (req, res) => {
  try {
    await client.connect();
    const collection = client.db("feedback").collection("reviews");
    const reviews = await collection.find().toArray();
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    await client.close();
  }
});

router.post("/", async (req, res) => {
  const { review, rating, name } = req.body;

  if (!review || !rating || !name) {
    return res
      .status(400)
      .json({ message: "Missing required fields: review, rating, name" });
  }

  const date = new Date();

  try {
    await client.connect();
    const collection = client.db("feedback").collection("reviews");
    const result = await collection.insertOne({ review, rating, name, date });
    res.status(201).json(result.ops[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    await client.close();
  }
});

module.exports = router;
