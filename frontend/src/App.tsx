import { FormEvent, useMemo, useState } from 'react';
import { examples } from './data/examples';
import { AnalyzeResponse, ComparedTestResult, Verdict } from './types';

const DEFAULT_EXAMPLE = examples[0];

function formatJson(value: unknown): string {
  if (typeof value === 'undefined') return '—';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value < 0.01) return '<0.01 ms';
  if (value < 10) return `${value.toFixed(3)} ms`;
  return `${value.toFixed(1)} ms`;
}

function verdictStyles(verdict: Verdict): string {
  if (verdict === 'Likely Equivalent') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200';
  if (verdict === 'Likely Different') return 'border-amber-400/40 bg-amber-400/10 text-amber-200';
  return 'border-rose-400/40 bg-rose-400/10 text-rose-200';
}

function CodeEditor({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/70 shadow-2xl shadow-slate-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="font-semibold text-slate-100">{label}</h2>
          <p className="text-xs text-slate-400">Language: Python</p>
        </div>
        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">
          def solve(...)
        </span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="min-h-[360px] w-full resize-y rounded-b-2xl bg-transparent p-4 font-mono text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-sky-400/40"
        placeholder="def solve(arr):\n    return max(arr)"
      />
    </section>
  );
}

function MetricCard({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-sm text-slate-400">{detail}</p> : null}
    </div>
  );
}

function StaticAnalysisPanel({ result, side }: { result: AnalyzeResponse; side: 'A' | 'B' }) {
  const algorithm = result.algorithms[side];
  const analysis = algorithm.staticAnalysis;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Algorithm {side}</h3>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
          {algorithm.functionName ?? 'No function'}({algorithm.parameters.join(', ')})
        </span>
      </div>
      {algorithm.executionError ? (
        <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          {algorithm.executionError}
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-slate-900/80 p-3">
          <dt className="text-slate-500">Time</dt>
          <dd className="mt-1 font-mono text-lg text-sky-200">{algorithm.complexity.time}</dd>
        </div>
        <div className="rounded-lg bg-slate-900/80 p-3">
          <dt className="text-slate-500">Space</dt>
          <dd className="mt-1 font-mono text-lg text-sky-200">{algorithm.complexity.space}</dd>
        </div>
        <div className="rounded-lg bg-slate-900/80 p-3">
          <dt className="text-slate-500">Runtime</dt>
          <dd className="mt-1 font-mono text-lg text-emerald-200">{formatMs(algorithm.runtimeMs)}</dd>
        </div>
        <div className="rounded-lg bg-slate-900/80 p-3">
          <dt className="text-slate-500">Confidence</dt>
          <dd className="mt-1 capitalize text-slate-100">{algorithm.complexity.confidence}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Detected patterns</p>
        <div className="flex flex-wrap gap-2">
          {analysis.patterns.map((pattern) => (
            <span key={pattern} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
              {pattern}
            </span>
          ))}
        </div>
      </div>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-400">
        {algorithm.complexity.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function RuntimeBars({ result }: { result: AnalyzeResponse }) {
  const runtimeA = result.algorithms.A.runtimeMs;
  const runtimeB = result.algorithms.B.runtimeMs;
  const max = Math.max(runtimeA, runtimeB, 0.01);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">Runtime Comparison</h3>
        <p className="text-sm text-slate-400">
          Measured over the generated tests. Runtime depends on hardware, input size, implementation details, and test cases.
        </p>
      </div>
      {(['A', 'B'] as const).map((side) => {
        const runtime = result.algorithms[side].runtimeMs;
        const width = `${Math.max(4, (runtime / max) * 100)}%`;
        return (
          <div key={side} className="mb-4 last:mb-0">
            <div className="mb-1 flex justify-between text-sm text-slate-300">
              <span>Algorithm {side}</span>
              <span className="font-mono">{formatMs(runtime)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TestTable({ tests }: { tests: ComparedTestResult[] }) {
  const shown = useMemo(() => {
    const failing = tests.filter((test) => !test.match).slice(0, 6);
    const passing = tests.filter((test) => test.match).slice(0, 6);
    return [...failing, ...passing].slice(0, 10);
  }, [tests]);

  if (tests.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
      <div className="border-b border-slate-800 px-5 py-4">
        <h3 className="text-lg font-semibold text-white">Sample Test Results</h3>
        <p className="text-sm text-slate-400">Showing failures first, then a few passing tests.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Input</th>
              <th className="px-4 py-3">Algorithm A</th>
              <th className="px-4 py-3">Algorithm B</th>
              <th className="px-4 py-3">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {shown.map((test) => (
              <tr key={test.id} className="text-slate-300">
                <td className="px-4 py-3 font-mono text-slate-500">{test.id}</td>
                <td className="max-w-sm px-4 py-3 font-mono text-xs">{formatJson(test.input)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-200">
                  {test.errorA ? <span className="text-rose-300">{test.errorA}</span> : formatJson(test.outputA)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-200">
                  {test.errorB ? <span className="text-rose-300">{test.errorB}</span> : formatJson(test.outputB)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${test.match ? 'bg-emerald-400/10 text-emerald-200' : 'bg-rose-400/10 text-rose-200'}`}>
                    {test.match ? 'MATCH' : 'DIFFERENT'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Results({ result }: { result: AnalyzeResponse }) {
  const passPercent = result.total === 0 ? 0 : Math.round(result.passRate * 100);

  return (
    <section className="mt-10 space-y-6" aria-live="polite">
      <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-2xl shadow-slate-950/30">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-sky-300">Analysis Result</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Functional Equivalence</h2>
          </div>
          <div className={`rounded-2xl border px-5 py-3 text-lg font-semibold ${verdictStyles(result.verdict)}`}>
            {result.verdict === 'Likely Equivalent' ? '✓' : result.verdict === 'Likely Different' ? '!' : '×'} {result.verdict}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard title="Tests Passed" value={`${result.passed} / ${result.total}`} detail={`${passPercent}% matched`} />
          <MetricCard title="Failed" value={String(result.failed)} detail="Generated cases" />
          <MetricCard title="Input Profile" value={result.generatedProfile} detail="Chosen by heuristics" />
          <MetricCard title="Evidence" value="Testing + Static" detail="No formal proof claimed" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <StaticAnalysisPanel result={result} side="A" />
        <StaticAnalysisPanel result={result} side="B" />
      </div>

      <RuntimeBars result={result} />

      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
        <h3 className="text-lg font-semibold text-white">Summary</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
          {result.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="mt-5 rounded-xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100">
          This MVP reports whether the algorithms appear equivalent based on generated tests. It does not mathematically prove equivalence.
        </div>
      </div>

      <TestTable tests={result.tests} />

      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
        <h3 className="text-lg font-semibold text-white">Notes and Limitations</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function App() {
  const [codeA, setCodeA] = useState(DEFAULT_EXAMPLE.codeA);
  const [codeB, setCodeB] = useState(DEFAULT_EXAMPLE.codeB);
  const [selectedExample, setSelectedExample] = useState(DEFAULT_EXAMPLE.id);
  const [testCount, setTestCount] = useState(DEFAULT_EXAMPLE.suggestedTests);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const selectedExampleDetails = examples.find((example) => example.id === selectedExample) ?? DEFAULT_EXAMPLE;

  function loadExample() {
    setCodeA(selectedExampleDetails.codeA);
    setCodeB(selectedExampleDetails.codeB);
    setTestCount(selectedExampleDetails.suggestedTests);
    setResult(null);
    setError(null);
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeA, codeB, testCount })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Analysis failed.');
      }

      setResult(data as AnalyzeResponse);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Analysis failed.');
      setResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.13),transparent_34rem),linear-gradient(180deg,#020617_0%,#0f172a_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-3xl border border-slate-800 bg-slate-950/70 p-8 text-center shadow-2xl shadow-slate-950/30">
          <p className="text-sm uppercase tracking-[0.45em] text-sky-300">University Practice Project</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">AlgoCompare</h1>
          <p className="mt-3 text-lg text-slate-300">Algorithm Equivalence &amp; Comparison</p>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-6 text-slate-400">
            Enter two Python implementations, generate test cases, compare outputs, estimate Big-O complexity, and review empirical runtime.
          </p>
        </header>

        <form onSubmit={analyze} className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Example algorithms</span>
                <select
                  value={selectedExample}
                  onChange={(event) => setSelectedExample(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                >
                  {examples.map((example) => (
                    <option key={example.id} value={example.id}>
                      {example.name}
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-sm text-slate-500">{selectedExampleDetails.description}</span>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Number of tests</span>
                <input
                  type="number"
                  min={1}
                  max={250}
                  value={testCount}
                  onChange={(event) => setTestCount(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 lg:w-40"
                />
              </label>
              <button
                type="button"
                onClick={loadExample}
                className="rounded-xl border border-sky-400/40 bg-sky-400/10 px-5 py-3 font-semibold text-sky-100 transition hover:bg-sky-400/20"
              >
                Load Example
              </button>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <CodeEditor label="Algorithm A" value={codeA} onChange={setCodeA} />
            <CodeEditor label="Algorithm B" value={codeB} onChange={setCodeB} />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-100">
              <strong>Analysis error:</strong> {error}
            </div>
          ) : null}

          <div className="flex justify-center">
            <button
              type="submit"
              disabled={isAnalyzing}
              className="rounded-2xl bg-sky-400 px-8 py-4 text-base font-bold text-slate-950 shadow-lg shadow-sky-950/40 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            >
              {isAnalyzing ? 'Analyzing Algorithms...' : 'Analyze Algorithms'}
            </button>
          </div>
        </form>

        {result ? <Results result={result} /> : null}
      </div>
    </main>
  );
}

export default App;
