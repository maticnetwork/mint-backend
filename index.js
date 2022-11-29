const bodyParser = require("body-parser");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/Database");
const session = require("cookie-session");
const compression = require("compression");

const { biconomyInit } = require("./config/Biconomy");
const { RunCron } = require("./config/Cron");

const cookieParser = require("cookie-parser");
const SingleMint = require("./routes/singleMint");
const BatchUpload = require("./routes/batchUpload");
const BatchMint = require("./routes/batchMint");
const Claim = require("./routes/claim");
const { collectionCreation } = require("./routes/apiContract");
const BatchAPI = require("./routes/batchMint/batchMint");
const { uploadBatchAPI } = require("./routes/batchMint/batchUpload");
const Analytics = require("./routes/analytics");
const User = require("./routes/user");
const Autograph = require("./routes/utilities/autograph");
const Phygital = require("./routes/utilities/phygital");
const FetchUtilities = require("./routes/utilities/Fetch");
const Gift = require("./routes/utilities/gift");
const Unlockable = require("./routes/utilities/unlockable");
const { errorConverter, errorHandler } = require("./utils/Error");
const ApiError = require("./utils/ApiError");

const app = express();

app.use(bodyParser.json({limit: '500mb', extended: true}));
app.use(bodyParser.urlencoded({ limit: '500mb', extended: true, parameterLimit: 100000000000 }));

// Init Biconomy
biconomyInit();
// Connect to MongoDB and Redis
const redisClient = connectDB();
// Run Cron
RunCron();

app.set("trust proxy", 1);
app.use(cookieParser());

app.use(
  session({
    secret: "polygon",
    resave: false,
    proxy: true,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// Express configuration
app.set("port", process.env.PORT || 5000);

app.use(cors({ origin: "*" }));
app.use(compression());

app.use("/v1", SingleMint(redisClient));
app.use("/v1", BatchUpload);
app.use("/v1", BatchMint);
app.use("/v1", Claim);
app.use("/v1", Analytics(redisClient));
app.use("/api", User(redisClient));
app.use("/v2", uploadBatchAPI(redisClient));
app.use("/v2", BatchAPI(redisClient));
app.use("/v2", collectionCreation(redisClient));
app.use("/dehidden/autograph", Autograph);
app.use("/dehidden/phygital", Phygital);
app.use("/dehidden/gift", Gift);
app.use("/dehidden/unlockable", Unlockable);

//to fetch the utiilities
app.use("/utilities", FetchUtilities);

app.get("/", (_req, res) => {
  res.send("API Running");
});

app.get("/health-check", (req, res) => res.status(200).json({ success: true, timestamp: Date.now(), message: 'health check success' }));

app.use((req, res, next) => {
  next(new ApiError(400, "We lost into UnknownVerse"));
});
// convert error to ApiError, if needed
app.use(errorConverter);
// handle error
app.use(errorHandler);

const port = app.get("port");
const server = app.listen(port, () =>
  console.log(`Server started on port ${port}`)
);

// server.timeout = 5000000;

server.setTimeout(600 * 60 * 1000);

server.on('connection', function(socket) {
  socket.setTimeout(600 * 60 * 1000); // now works perfectly...
});

module.exports = server;
