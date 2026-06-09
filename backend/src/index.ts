import "dotenv/config";
// Initialise Sentry before importing anything that may throw at startup.
import { initSentry } from "./lib/sentry";
initSentry();
import app from "./app";

const PORT = parseInt(process.env.PORT ?? "3001");

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
