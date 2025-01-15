const express = require("express");
const router = express.Router();
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const sharp = require("sharp");
const bcrypt = require("bcrypt");

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

// check if username or email exists in the system
router.get("/:email/:username", async (req, res) => {
  const email = req.params.email;
  const username = req.params.username;

  if (!email || !username) {
    return res.status(400).json({ message: "Email and Username are required" });
  }

  try {
    await client.connect();
    const collection = client.db("chapterchat").collection("users");
    const emailFound = await collection.findOne({ email: email });
    const userFound = await collection.findOne({ username: username });

    if (userFound && emailFound) {
      res.status(409).json({ message: "Email and Username already exist." });
    } else if (userFound) {
      res.status(409).json({ message: "Username already exists." });
    } else if (emailFound) {
      res.status(409).json({ message: "Email already exists." });
    } else {
      res.status(200).json({ message: "" });
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
  const { author, title, review, rating } = req.body;
  const cover = req.file;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const resizedCover = await sharp(cover.buffer).resize(800, 1220).toBuffer();

    await client.connect();
    const collection = client.db("chapterchat").collection("users");

    const bookId = new ObjectId();
    const result = await collection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $push: {
          books: {
            id: bookId,
            author: author,
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

// update/edit a book's information
router.post("/:userid/book/:bookId/edit", upload.single("cover"), async (req, res) => {
  const userId = req.params.userid;
  const bookId = req.params.bookId;
  const { author, title, review, rating } = req.body;
  const coverFile = req.file;
  const coverBufferString = req.body.cover;

  if (!userId || !bookId) {
    return res.status(400).json({ message: "User ID and Book ID are required" });
  }

  try {
    let resizedCover;
    if (coverFile) {
      resizedCover = await sharp(coverFile.buffer).resize(800, 1220).toBuffer();
    } 
    else if (coverBufferString) {
      const buffer = Buffer.from(coverBufferString, "base64");
      resizedCover = await sharp(buffer).resize(800, 1220).toBuffer();
    } 

    await client.connect();
    const collection = client.db("chapterchat").collection("users");

    const updateFields = {
      "books.$.author": author,
      "books.$.title": title,
      "books.$.review": review,
      "books.$.rating": rating,
    };

    if (resizedCover) {
      updateFields["books.$.cover"] = resizedCover.toString("base64");
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(userId), "books.id": new ObjectId(bookId) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ message: "User not found" });
    } else if (result.modifiedCount === 0) {
      res.status(404).json({ message: "Book not found" });
    } else {
      res.status(200).json({ message: "Book updated successfully" });
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
    let book;
    if (user) {
      let ID = new ObjectId(bookId);
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

// delete a book by user ID and book ID
router.delete("/:userid/book/:bookId", async (req, res) => {
  const userId = req.params.userid;
  const bookId = req.params.bookId;

  if (!userId || !bookId) {
    return res
      .status(400)
      .json({ message: "User ID and Book ID are required" });
  }

  try {
    await client.connect();
    const collection = client.db("chapterchat").collection("users");

    const result = await collection.updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { books: { id: new ObjectId(bookId) } } }
    );

    if (result.matchedCount === 0) {
      res.status(404).json({ message: "User not found" });
    } else if (result.modifiedCount === 0) {
      res.status(404).json({ message: "Book not found" });
    } else {
      res.status(200).json({ message: "Book deleted from shelf!" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    await client.close();
  }
});

// update the changes to the user profile
router.post("/:userid/update", async (req, res) => {
  const userId = req.params.userid;
  const { email, username, password } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    // Find the user by their given ID
    await client.connect();
    const collection = client.db("chapterchat").collection("users");
    const user = await collection.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // If the user is found, check for if another user has the email or username given
    const existingUser = await collection.findOne({
      $or: [
        { email: email, _id: { $ne: new ObjectId(userId) } },
        { username: username, _id: { $ne: new ObjectId(userId) } }
      ]
    });
    // return a 409 error for the client side to receive if there is existing fields
    if (existingUser) {
      return res.status(409).json({ message: "Email or username already exists" });
    }

    // Update the user's fields if they are provided
    const updateFields = {};
    if (email) updateFields.email = email;
    if (username) updateFields.username = username;
    if (password) {
      const salt = 10;
      const hashedPassword = await bcrypt.hash(password, salt);
      updateFields.password = hashedPassword;
    }
    console.log(updateFields);
    // Save the updated user
    await collection.updateOne({ _id: new ObjectId(userId) }, { $set: updateFields });

    // Send a success response
    res.status(200).json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


module.exports = router;