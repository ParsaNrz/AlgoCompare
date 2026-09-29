import { GeneratedTests, StaticAnalysis, TestCase } from '../types';

interface GeneratorOptions {
  analysisA: StaticAnalysis;
  analysisB: StaticAnalysis;
  requestedCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intBetween(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function uniquePush(cases: TestCase[], candidate: TestCase): void {
  const key = JSON.stringify(candidate.args);
  if (!cases.some((test) => JSON.stringify(test.args) === key)) {
    cases.push(candidate);
  }
}

function codeText(analysis: StaticAnalysis): string {
  return [analysis.functionName, ...analysis.parameters, ...analysis.patterns].join(' ').toLowerCase();
}

function looksArrayBased(analysis: StaticAnalysis): boolean {
  const text = codeText(analysis);
  return (
    /(arr|array|nums|numbers|list|values|items|sequence)/.test(text) ||
    analysis.loopCount > 0 ||
    analysis.usesLinearBuiltin ||
    analysis.hasSorting
  );
}

function looksNumberBased(analysis: StaticAnalysis): boolean {
  const text = codeText(analysis);
  return /(factorial|fibonacci|fib|number|integer|\bn\b)/.test(text) || analysis.hasRecursion;
}

function mayRejectEmptyArray(analysis: StaticAnalysis): boolean {
  const text = [...analysis.patterns, analysis.complexity.notes.join(' ')].join(' ').toLowerCase();
  return (
    text.includes('min/max') ||
    analysis.hasSorting ||
    /(^|\W)(max|min)($|\W)/.test(text) ||
    analysis.parameters.some((param) => /arr|nums|values|items|list/.test(param.toLowerCase()))
  );
}

function chooseProfile(a: StaticAnalysis, b: StaticAnalysis): string {
  const count = Math.max(a.parameterCount, b.parameterCount);

  if (count === 2 && (looksArrayBased(a) || looksArrayBased(b))) {
    return 'array-search';
  }

  if (count === 1) {
    if ((looksNumberBased(a) || looksNumberBased(b)) && !(looksArrayBased(a) || looksArrayBased(b))) {
      return 'single-number';
    }
    return 'array';
  }

  if (count === 0) {
    return 'no-argument';
  }

  return 'small-integers';
}

function makeArray(random: () => number, length: number): number[] {
  return Array.from({ length }, () => intBetween(random, -100, 100));
}

function addArrayTests(cases: TestCase[], count: number, random: () => number, includeEmpty: boolean): void {
  const baseArrays = [
    [5, 2, 9, 1],
    [1],
    [0, 0, 0, 0],
    [-5, -1, -9, -3],
    [1, 2, 3, 4, 5, 6],
    [6, 5, 4, 3, 2, 1],
    [3, 3, 2, 8, 8, 1],
    [1000000, -1000000, 42, 42]
  ];

  if (includeEmpty) {
    baseArrays.unshift([]);
  }

  for (const arr of baseArrays) {
    if (cases.length >= count) return;
    uniquePush(cases, { id: cases.length + 1, label: `array length ${arr.length}`, args: [arr] });
  }

  while (cases.length < count) {
    const length = includeEmpty ? intBetween(random, 0, 60) : intBetween(random, 1, 60);
    let arr = makeArray(random, length);

    const shape = cases.length % 6;
    if (shape === 1) arr = [...arr].sort((x, y) => x - y);
    if (shape === 2) arr = [...arr].sort((x, y) => y - x);
    if (shape === 3) arr = arr.map((value) => Math.round(value / 10));
    if (shape === 4 && arr.length > 0) arr[0] = intBetween(random, 500, 1000);
    if (shape === 5 && arr.length > 0) arr[arr.length - 1] = intBetween(random, -1000, -500);

    uniquePush(cases, { id: cases.length + 1, label: `random array length ${length}`, args: [arr] });
  }
}

function addArraySearchTests(cases: TestCase[], count: number, random: () => number): void {
  const base: Array<[number[], number]> = [
    [[5, 2, 9, 1], 9],
    [[5, 2, 9, 1], 7],
    [[], 3],
    [[1], 1],
    [[1], 2],
    [[4, 4, 4], 4],
    [[-3, 0, 8, -1], -1]
  ];

  for (const [arr, target] of base) {
    if (cases.length >= count) return;
    uniquePush(cases, { id: cases.length + 1, label: `search target ${target}`, args: [arr, target] });
  }

  while (cases.length < count) {
    const length = intBetween(random, 0, 50);
    const arr = makeArray(random, length);
    const chooseExisting = arr.length > 0 && random() < 0.65;
    const target = chooseExisting ? arr[intBetween(random, 0, arr.length - 1)] : intBetween(random, -120, 120);
    uniquePush(cases, { id: cases.length + 1, label: `search in length ${length}`, args: [arr, target] });
  }
}

function addNumberTests(cases: TestCase[], count: number, random: () => number): void {
  const baseNumbers = [0, 1, 2, 3, 4, 5, 8, 10, 12];

  for (const value of baseNumbers) {
    if (cases.length >= count) return;
    uniquePush(cases, { id: cases.length + 1, label: `n = ${value}`, args: [value] });
  }

  while (cases.length < count) {
    // Keep values small so recursive educational examples such as Fibonacci finish quickly.
    const value = intBetween(random, 0, 14);
    uniquePush(cases, { id: cases.length + 1, label: `random n = ${value}`, args: [value] });
  }
}

function addSmallIntegerTests(cases: TestCase[], count: number, random: () => number, parameterCount: number): void {
  uniquePush(cases, {
    id: cases.length + 1,
    label: 'all zeros',
    args: Array.from({ length: parameterCount }, () => 0)
  });
  uniquePush(cases, {
    id: cases.length + 1,
    label: 'small positives',
    args: Array.from({ length: parameterCount }, (_, index) => index + 1)
  });

  while (cases.length < count) {
    uniquePush(cases, {
      id: cases.length + 1,
      label: 'random small integers',
      args: Array.from({ length: parameterCount }, () => intBetween(random, -20, 20))
    });
  }
}

export function generateTests({ analysisA, analysisB, requestedCount }: GeneratorOptions): GeneratedTests {
  const count = clamp(Number.isFinite(requestedCount) ? Math.round(requestedCount) : 100, 1, 250);
  const random = createSeededRandom(20260929);
  const profile = chooseProfile(analysisA, analysisB);
  const cases: TestCase[] = [];
  const notes: string[] = [];

  if (analysisA.parameterCount !== analysisB.parameterCount) {
    notes.push('The detected functions have different parameter counts; generated tests use the larger count and execution may fail.');
  }

  if (profile === 'array') {
    const includeEmpty = !(mayRejectEmptyArray(analysisA) || mayRejectEmptyArray(analysisB));
    if (!includeEmpty) {
      notes.push('Empty arrays were skipped because one implementation appears to require a non-empty array.');
    }
    addArrayTests(cases, count, random, includeEmpty);
  } else if (profile === 'array-search') {
    addArraySearchTests(cases, count, random);
  } else if (profile === 'single-number') {
    addNumberTests(cases, count, random);
  } else if (profile === 'no-argument') {
    uniquePush(cases, { id: 1, label: 'no arguments', args: [] });
  } else {
    addSmallIntegerTests(cases, count, random, Math.max(analysisA.parameterCount, analysisB.parameterCount, 1));
  }

  return {
    profile,
    notes,
    tests: cases.slice(0, count).map((test, index) => ({ ...test, id: index + 1 }))
  };
}
