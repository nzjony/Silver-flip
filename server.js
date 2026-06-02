const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = 8000;
const ROOT = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function parseStooqCsv(csv) {
  const [headerLine, dataLine] = csv.trim().split(/\r?\n/);
  if (!headerLine || !dataLine) throw new Error("Missing quote row.");
  const headers = headerLine.split(",");
  const values = dataLine.split(",");
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  const price = Number(row.Close);
  if (!Number.isFinite(price)) throw new Error("Invalid close price.");
  return {
    symbol: row.Symbol,
    price,
    date: row.Date,
    time: row.Time,
    source: "Stooq XAG/USD"
  };
}

async function handleSilverQuote(res) {
  try {
    const url = "https://stooq.com/q/l/?s=xagusd&f=sd2t2ohlcv&h&e=csv";
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Quote source returned ${response.status}.`);
    const quote = parseStooqCsv(await response.text());
    send(res, 200, JSON.stringify(quote), "application/json; charset=utf-8");
  } catch (error) {
    send(res, 502, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
  }
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    send(res, 200, body, MIME[path.extname(filePath)] ?? "application/octet-stream");
  } catch {
    send(res, 404, "Not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/silver")) {
    handleSilverQuote(res);
    return;
  }
  handleStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Silver Flip running at http://localhost:${PORT}/`);
});
