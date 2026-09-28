import "dotenv/config";
import cors from "cors";
import express from "express";
import { incidentsRouter } from "./routes/incidents.ts";

const app = express();
const port = Number(process.env.PORT || 3000);

const localDevelopmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const configuredFrontendOrigin = process.env.FRONTEND_URL?.trim().replace(/\/+$/, "");
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || localDevelopmentOrigin.test(origin) || origin === configuredFrontendOrigin);
  },
}));
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "incident-memory-agent" });
});

app.use("/api/incidents", incidentsRouter);

app.listen(port, () => {
  console.log(`Incident Memory Agent backend listening on http://localhost:${port}`);
});
