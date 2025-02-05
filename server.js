require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const { router: loginRoute, isAuthenticated } = require("./routes/login");

app.use(
  cors({
    origin: [process.env.REACT_APP_API_URL, "http://localhost:3000", "https://chapterchat-bice.vercel.app"],
    credentials: true,
  })
);
app.use(express.json());

function authCheck(req, res, next) {
  const PUBLIC_PATHS = ["/", "/login", "/signup"];
  const path = req.path;
  if (!isAuthenticated(req) && !PUBLIC_PATHS.includes(path)) {
    return res
      .status(404)
      .json({ message: "You are not authorized to access this page" });
  }
  next();
}

app.use(authCheck);

app.use("/users", require("./routes/users"));
app.use("/login", loginRoute);
app.use("/signup", require("./routes/signup"));

app.listen(process.env.PORT || 3000, () => {
  if (!process.env.PORT) {
    console.log("Server is running on port: 3000");
  }
  else {
    console.log("Server is running on port: " + process.env.PORT);
  }
});
