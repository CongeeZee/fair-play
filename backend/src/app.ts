import express from "express";
import cors from "cors";
import coursesRouter from "./routes/courses";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/courses", coursesRouter);

export default app;

