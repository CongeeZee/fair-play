import "dotenv/config";
import app from "./app";

const PORT = parseInt(process.env.PORT ?? "3001");

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
