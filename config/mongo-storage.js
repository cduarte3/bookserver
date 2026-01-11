require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const dbUrl = process.env.DATABASE_URL;

    await mongoose.connect(dbUrl);
    console.log("Connected to MongoDB");
    return true;
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    return false;
  }
};

module.exports = connectDB;
