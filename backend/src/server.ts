import cors from 'cors';
import express, { Request, Response } from 'express';
import { analyzeAlgorithms } from './services/comparisonService';

const app = express();
const port = Number(process.env.PORT ?? 5050);

app.use(cors({ origin: true }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_request: Request, response: Response) => {
  response.json({ ok: true, name: 'AlgoCompare API' });
});

app.post('/api/analyze', async (request: Request, response: Response) => {
  const { codeA, codeB, testCount } = request.body ?? {};

  if (typeof codeA !== 'string' || typeof codeB !== 'string') {
    response.status(400).json({ error: 'codeA and codeB must be strings containing Python functions.' });
    return;
  }

  if (codeA.length > 20_000 || codeB.length > 20_000) {
    response.status(400).json({ error: 'Submitted code is too large for this university MVP. Please keep each file under 20,000 characters.' });
    return;
  }

  const numericTestCount = Number(testCount ?? 100);
  if (!Number.isFinite(numericTestCount) || numericTestCount < 1) {
    response.status(400).json({ error: 'testCount must be a positive number.' });
    return;
  }

  try {
    const result = await analyzeAlgorithms({ codeA, codeB, testCount: numericTestCount });
    response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    response.status(500).json({ error: message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`AlgoCompare API listening on http://0.0.0.0:${port}`);
});
