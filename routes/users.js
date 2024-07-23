const express = require("express");
const router = express.Router();
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const sharp = require("sharp");

const client = new MongoClient(process.env.DATABASE_URL);

// get the info of a user by ID
router.get("/:userid", async (req, res) => {
  const userId = req.params.userid;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    await client.connect();
    const collection = client.db("chapterchat").collection("users");
    const user = await collection.findOne({ _id: new ObjectId(userId) });

    if (user) {
      const { password, ...userWithoutPassword } = user;
      res.status(200).json(userWithoutPassword);
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

// post a review for a book by user ID
router.post("/:userid", upload.single("cover"), async (req, res) => {
  const userId = req.params.userid;
  const { title, review, rating } = req.body;
  const cover = req.file;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const resizedCover = await sharp(cover.buffer)
      .resize(800, 1220)
      .toBuffer();

    await client.connect();
    const collection = client.db("chapterchat").collection("users");

    const bookId = new ObjectId();
    const result = await collection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $push: {
          books: {
            id: bookId,
            title: title,
            review: review,
            rating: rating,
            cover: resizedCover.toString("base64"),
          },
        },
      }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ message: "User not found" });
    } else {
      res.status(200).json({
        message: "Book added to shelf!",
        bookId: bookId,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    await client.close();
  }
});

// get book information
router.get("/:userid/book/:bookId", async (req, res) => {
  const userId = req.params.userid;
  const bookId = req.params.bookId;

  if (!userId || !bookId) {
    return res.status(400).json({ message: "User ID or Book ID is required" });
  }

  try {
    await client.connect();
    const collection = client.db("chapterchat").collection("users");
    const user = await collection.findOne({ _id: new ObjectId(userId) });

    if (user) {
      ID = new ObjectId(bookId);
      for (let i = 0; i < user.books.length; i++) {
        if (user.books[i].id.equals(ID)) {
          book = user.books[i];
          break;
        }
      }
      if (book) {
        res.status(200).json(book);
      } else {
        res.status(404).json({ message: "Book not found" });
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

module.exports = router;
