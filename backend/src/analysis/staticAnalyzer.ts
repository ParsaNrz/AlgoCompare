import { ComplexityEstimate, StaticAnalysis } from '../types';

const UNKNOWN_COMPLEXITY: ComplexityEstimate = {
  time: 'Unable to determine automatically',
  space: 'Unable to determine automatically',
  confidence: 'low',
  notes: ['The code does not match one of the simple educational patterns supported by this MVP.']
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripStringsAndComments(code: string): string {
  // A lightweight cleaner for heuristic matching. The Python sandbox performs real syntax validation.
  return code
    .replace(/'''[\s\S]*?'''/g, '')
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .split('\n')
    .map((line) => line.replace(/#.*/, ''))
    .join('\n');
}

function findFirstFunction(code: string): { name: string | null; parameters: string[] } {
  const match = code.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/m);

  if (!match) {
    return { name: null, parameters: [] };
  }

  const parameters = match[2]
    .split(',')
    .map((param) => param.trim())
    .filter(Boolean)
    .map((param) => param.replace(/=.*/, '').replace(/:.*/, '').trim())
    .filter((param) => !param.startsWith('*') && param !== 'self');

  return { name: match[1], parameters };
}

function countMatches(code: string, pattern: RegExp): number {
  return [...code.matchAll(pattern)].length;
}

function detectNestedLoops(code: string): boolean {
  const loopIndents: number[] = [];
  const lines = code.replace(/\t/g, '    ').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*/, '');
    if (!line.trim()) continue;

    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    while (loopIndents.length > 0 && indent <= loopIndents[loopIndents.length - 1]) {
      loopIndents.pop();
    }

    if (/^\s*(for|while)\b.*:\s*$/.test(line)) {
      if (loopIndents.length > 0) {
        return true;
      }
      loopIndents.push(indent);
    }
  }

  return false;
}

function detectsLogarithmicLoop(cleanCode: string): boolean {
  return /while\s+.+:/.test(cleanCode) && /(\/\/\s*=\s*2|=\s*[^\n]*(\/\/|\/)\s*2|>>=\s*1)/.test(cleanCode);
}

function detectAllocatedLinearSpace(cleanCode: string): boolean {
  return (
    /sorted\s*\(/.test(cleanCode) ||
    /\[[^\]]*\bfor\b[\s\S]*\]/.test(cleanCode) ||
    /\b(list|set|dict)\s*\(/.test(cleanCode) ||
    /\.append\s*\(/.test(cleanCode) ||
    /\{[^}]*\bfor\b[\s\S]*\}/.test(cleanCode) ||
    /\bcopy\s*\(/.test(cleanCode) ||
    /\[:\]/.test(cleanCode)
  );
}

function estimateComplexity(code: string, analysisBits: {
  functionName: string | null;
  loopCount: number;
  hasNestedLoops: boolean;
  hasRecursion: boolean;
  hasSorting: boolean;
  usesLinearBuiltin: boolean;
}): ComplexityEstimate {
  const cleanCode = stripStringsAndComments(code);
  const notes: string[] = [];
  let time: ComplexityEstimate['time'] = 'Unable to determine automatically';
  let space: ComplexityEstimate['space'] = 'O(1)';
  let confidence: ComplexityEstimate['confidence'] = 'medium';

  const allocatedLinearSpace = detectAllocatedLinearSpace(cleanCode);
  const maybeQuadraticSpace = /\[\s*\[[\s\S]*\]\s*for\b/.test(cleanCode) || /matrix|grid|table|dp\s*=\s*\[\s*\[/.test(cleanCode);

  if (!analysisBits.functionName) {
    return {
      ...UNKNOWN_COMPLEXITY,
      notes: ['No Python function definition was found. Add a function such as def solve(arr): ...']
    };
  }

  if (analysisBits.hasRecursion) {
    const escapedName = escapeRegExp(analysisBits.functionName);
    const recursiveCalls = Math.max(0, countMatches(cleanCode, new RegExp(`\\b${escapedName}\\s*\\(`, 'g')) - 1);
    if (recursiveCalls >= 2 || /\bn\s*-\s*1[\s\S]*\bn\s*-\s*2/.test(cleanCode)) {
      time = 'O(2^n)';
      notes.push('Multiple recursive calls suggest exponential time, as in naive Fibonacci.');
    } else {
      time = 'O(n)';
      notes.push('A single recursive call usually grows linearly with n for simple educational examples.');
    }
    space = 'O(n)';
    notes.push('Recursive calls use stack space.');
    return { time, space, confidence, notes };
  }

  if (analysisBits.hasSorting) {
    time = 'O(n log n)';
    space = /sorted\s*\(/.test(cleanCode) ? 'O(n)' : allocatedLinearSpace ? 'O(n)' : 'O(1)';
    notes.push('Python sorting is treated as O(n log n). sorted(...) also creates a new list.');
    return { time, space, confidence: 'high', notes };
  }

  if (analysisBits.hasNestedLoops) {
    time = 'O(n²)';
    space = maybeQuadraticSpace ? 'O(n²)' : allocatedLinearSpace ? 'O(n)' : 'O(1)';
    notes.push('Nested loops over input-sized data suggest quadratic time.');
    return { time, space, confidence, notes };
  }

  if (detectsLogarithmicLoop(cleanCode)) {
    time = 'O(log n)';
    space = allocatedLinearSpace ? 'O(n)' : 'O(1)';
    notes.push('A loop that repeatedly halves a value suggests logarithmic time.');
    return { time, space, confidence, notes };
  }

  if (analysisBits.loopCount > 0 || analysisBits.usesLinearBuiltin) {
    time = 'O(n)';
    space = allocatedLinearSpace ? 'O(n)' : 'O(1)';
    notes.push('A single loop or linear Python builtin suggests linear time.');
    return { time, space, confidence: analysisBits.usesLinearBuiltin ? 'high' : 'medium', notes };
  }

  if (/\b(len|abs|round|int|float|str|bool)\s*\(/.test(cleanCode) || /return\s+[-+]?\d+/.test(cleanCode)) {
    time = 'O(1)';
    space = 'O(1)';
    notes.push('No input-sized loop, recursion, sorting, or linear builtin was detected.');
    return { time, space, confidence: 'medium', notes };
  }

  return UNKNOWN_COMPLEXITY;
}

export function analyzeCode(code: string, label: 'A' | 'B'): StaticAnalysis {
  const cleanCode = stripStringsAndComments(code);
  const { name: functionName, parameters } = findFirstFunction(code);
  const returnCount = countMatches(cleanCode, /^\s*return\b/gm);
  const loopCount = countMatches(cleanCode, /^\s*(for|while)\b/gm);
  const hasNestedLoops = detectNestedLoops(cleanCode);
  const hasSorting = /\bsorted\s*\(|\.sort\s*\(/.test(cleanCode);
  const usesLinearBuiltin = /\b(max|min|sum|any|all)\s*\(|\.index\s*\(|\bin\s+/.test(cleanCode);
  const hasRecursion = Boolean(
    functionName && Math.max(0, countMatches(cleanCode, new RegExp(`\\b${escapeRegExp(functionName)}\\s*\\(`, 'g')) - 1) > 0
  );

  const patterns: string[] = [];
  if (loopCount > 0) patterns.push(loopCount === 1 ? 'loop' : `${loopCount} loops`);
  if (hasNestedLoops) patterns.push('nested loops');
  if (hasRecursion) patterns.push('recursion');
  if (hasSorting) patterns.push('sorting');
  if (/\b(max|min)\s*\(/.test(cleanCode)) patterns.push('min/max selection');
  if (/\bsum\s*\(/.test(cleanCode)) patterns.push('aggregation');
  if (/\.index\s*\(|\bin\s+/.test(cleanCode)) patterns.push('search/membership');
  if (detectAllocatedLinearSpace(cleanCode)) patterns.push('creates additional collection');

  const warnings: string[] = [];
  if (!functionName) warnings.push('No function definition was detected.');
  if (parameters.length === 0 && functionName) warnings.push('The detected function has no parameters, so generated tests may be limited.');
  if (/\bwhile\s+True\b/.test(cleanCode)) warnings.push('Contains while True; execution timeout protects the server if it does not terminate.');
  if (/\b(input|open|eval|exec|compile|__import__)\s*\(/.test(cleanCode)) {
    warnings.push('Uses a restricted builtin that is blocked by the sandbox.');
  }

  const complexity = estimateComplexity(code, {
    functionName,
    loopCount,
    hasNestedLoops,
    hasRecursion,
    hasSorting,
    usesLinearBuiltin
  });

  return {
    label,
    functionName,
    parameters,
    parameterCount: parameters.length,
    returnCount,
    loopCount,
    hasNestedLoops,
    hasRecursion,
    hasSorting,
    usesLinearBuiltin,
    patterns: patterns.length > 0 ? patterns : ['simple expression or unsupported pattern'],
    warnings,
    complexity
  };
}
