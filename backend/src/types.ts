export type ComplexityValue =
  | 'O(1)'
  | 'O(log n)'
  | 'O(n)'
  | 'O(n log n)'
  | 'O(n²)'
  | 'O(2^n)'
  | 'Unable to determine automatically';

export interface ComplexityEstimate {
  time: ComplexityValue;
  space: ComplexityValue;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

export interface StaticAnalysis {
  label: 'A' | 'B';
  functionName: string | null;
  parameters: string[];
  parameterCount: number;
  returnCount: number;
  loopCount: number;
  hasNestedLoops: boolean;
  hasRecursion: boolean;
  hasSorting: boolean;
  usesLinearBuiltin: boolean;
  patterns: string[];
  warnings: string[];
  complexity: ComplexityEstimate;
}

export interface TestCase {
  id: number;
  label: string;
  args: unknown[];
}

export interface GeneratedTests {
  profile: string;
  notes: string[];
  tests: TestCase[];
}

export interface SandboxResultItem {
  id: number;
  ok: boolean;
  output?: unknown;
  outputRepr?: string;
  error?: string;
  traceback?: string;
  runtimeMs: number;
}

export interface SandboxExecutionResult {
  ok: boolean;
  functionName?: string;
  runtimeMs: number;
  results: SandboxResultItem[];
  errorType?: string;
  message?: string;
  stderr?: string;
}

export interface ComparedTestResult {
  id: number;
  label: string;
  input: unknown[];
  outputA?: unknown;
  outputB?: unknown;
  outputARepr?: string;
  outputBRepr?: string;
  errorA?: string;
  errorB?: string;
  match: boolean;
}

export interface AlgorithmReport {
  functionName: string | null;
  parameters: string[];
  complexity: ComplexityEstimate;
  runtimeMs: number;
  staticAnalysis: StaticAnalysis;
  executionError?: string;
}

export interface AnalyzeResponse {
  verdict: 'Likely Equivalent' | 'Likely Different' | 'Unable to compare';
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  generatedProfile: string;
  algorithms: {
    A: AlgorithmReport;
    B: AlgorithmReport;
  };
  tests: ComparedTestResult[];
  summary: string[];
  notes: string[];
}
