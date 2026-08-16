import { app } from "./app.js";

const PORT = 3000;

app.listen(PORT, "localhost", () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
