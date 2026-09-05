#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const utf8Path = path.join(projectRoot, 'tests/fixtures/dgpa/calendar-2026-utf8.csv');
const big5Path = path.join(projectRoot, 'tests/fixtures/dgpa/calendar-2025-big5.csv');

if (!fs.existsSync(utf8Path) || !fs.existsSync(big5Path)) {
  console.error(`Fixture CSV files not found in ${path.join(projectRoot, 'tests/fixtures/dgpa')}`);
  process.exit(1);
}

const utf8Buffer = fs.readFileSync(utf8Path);
const big5Buffer = fs.readFileSync(big5Path);

const portArgIdx = process.argv.indexOf('--port');
const port = portArgIdx !== -1 ? Number(process.argv[portArgIdx + 1]) : Number(process.env.PORT || 54329);

const requestCounts = {
  metadata: 0,
  utf8Csv: 0,
  big5Csv: 0,
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const host = req.headers.host || `127.0.0.1:${port}`;

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port, requestCounts }));
    return;
  }

  if (url.pathname === '/api/v2/rest/dataset/14718') {
    requestCounts.metadata++;
    const metadata = {
      result: {
        distribution: [
          {
            resourceDescription: '115年中華民國政府行政機關辦公日曆表',
            resourceFormat: 'CSV',
            resourceCharacterEncoding: 'UTF-8',
            resourceField: [
              { name: '西元日期' },
              { name: '星期' },
              { name: '是否放假' },
              { name: '備註' },
            ],
            resourceQualityCheckTime: '2026-07-15 11:30:22',
            resourceDownloadUrl: `http://${host}/fixtures/calendar-2026-utf8.csv`,
          },
          {
            resourceDescription: '114年中華民國政府行政機關辦公日曆表(1141020更新)',
            resourceFormat: 'CSV',
            resourceCharacterEncoding: 'BIG5',
            resourceField: [
              { name: '西元日期' },
              { name: '星期' },
              { name: '是否放假' },
              { name: '備註' },
            ],
            resourceQualityCheckTime: '2026-07-15 11:30:19',
            resourceDownloadUrl: `http://${host}/fixtures/calendar-2025-big5.csv`,
          },
        ],
      },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metadata));
    return;
  }

  const sendCsvResponse = (buffer, contentType = 'text/csv') => {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  };

  if (url.pathname === '/fixtures/calendar-2026-utf8.csv') {
    requestCounts.utf8Csv++;
    sendCsvResponse(utf8Buffer, 'text/csv; charset=utf-8');
    return;
  }

  if (url.pathname === '/fixtures/calendar-2025-big5.csv') {
    requestCounts.big5Csv++;
    sendCsvResponse(big5Buffer, 'text/csv');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`DGPA fixture server listening on http://0.0.0.0:${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
