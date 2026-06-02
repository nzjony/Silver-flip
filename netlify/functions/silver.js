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

exports.handler = async () => {
  try {
    const url = "https://stooq.com/q/l/?s=xagusd&f=sd2t2ohlcv&h&e=csv";
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Quote source returned ${response.status}.`);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(parseStooqCsv(await response.text()))
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
