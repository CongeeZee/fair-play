import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import coursesRouter from "./routes/courses";
import roundsRouter from "./routes/rounds";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/courses", coursesRouter);
app.use("/rounds", roundsRouter);

// Catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
