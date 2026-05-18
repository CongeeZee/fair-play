import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import coursesRouter from "./routes/courses";
import roundsRouter from "./routes/rounds";
import handicapRouter from "./routes/handicap";
import { standardLimiter } from "./middleware/rateLimiter";
import prisma from "./lib/prisma";

const app = express();

app.use(cors());
app.use(express.json());
app.use(standardLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// OG meta tags for shared scorecards — serves HTML with meta tags so link previews work
app.get("/scorecard/:shareId", async (req, res) => {
  const shareId = String(req.params.shareId);
  const frontendUrl = process.env.FRONTEND_URL || "https://fairplay.app";

  try {
    const round = await prisma.round.findUnique({
      where: { shareId },
      include: {
        user: { select: { name: true } },
        course: { select: { name: true } },
        roundHoles: { include: { hole: { select: { par: true } } } },
      },
    });

    if (!round) {
      res.redirect(`${frontendUrl}/scorecard/${shareId}`);
      return;
    }

    const totalStrokes = round.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
    const totalPar = round.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
    const scoreToPar = totalStrokes - totalPar;
    const scoreStr = scoreToPar === 0 ? "even par" : scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;

    const title = `${round.user.name} shot ${totalStrokes} (${scoreStr}) at ${round.course.name}`;
    const description = `${round.roundHoles.length} holes played on ${new Date(round.playedAt).toLocaleDateString("en-GB", { dateStyle: "long" })}`;
    const url = `${frontendUrl}/scorecard/${shareId}`;

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} — Fairplay</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="Fairplay" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta http-equiv="refresh" content="0;url=${url}" />
</head>
<body>
  <p>Redirecting to <a href="${url}">scorecard</a>…</p>
</body>
</html>`);
  } catch {
    res.redirect(`${frontendUrl}/scorecard/${shareId}`);
  }
});

app.use("/auth", authRouter);
app.use("/courses", coursesRouter);
app.use("/rounds", roundsRouter);
app.use("/handicap", handicapRouter);

// Catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
