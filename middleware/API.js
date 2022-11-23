const User = require("../models/user");
const AuthCheck = async (req, res, next) => {
  const token = await req.headers["x-api-key"];
  if (!token) {
    return res.status(401).json({
      status: "error",
      message: "Access denied. No token provided.",
    });
  }

  const allowedOrigin = [
    "http://localhost:3000",
    "https://staging.mintnft.today",
    "https://mintnft.today",
  ];

  try {
    if (token === process.env.FRONTEND_API) {
      if (!(allowedOrigin.indexOf(req.get("origin")) > -1)) {
        return res.status(400).json({
          status: "error",
          message: "Access denied! Reqest form non origin url",
        });
      } else {
        next();
      }
    } else {
      const check = await User.findOne({
        $or: [{ api: token }, { socialApi: { $elemMatch: { api: token, status: "ACTIVE" } } }],
      });

      if (!check) {
        return res.status(401).json({
          status: "error",
          message: "Access denied. Invalid token.",
        });
      } else {
        next();
      }
    }
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: "Invalid token.",
    });
  }
};


module.exports = AuthCheck;
