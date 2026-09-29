export type Verdict = 'Likely Equivalent' | 'Likely Different' | 'Unable to compare';

export interface ComplexityEstimate {
  time: string;
  space: string;
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

export interface AlgorithmReport {
  functionName: string | null;
  parameters: string[];
  complexity: ComplexityEstimate;
  runtimeMs: number;
  staticAnalysis: StaticAnalysis;
  executionError?: string;
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

export interface AnalyzeResponse {
  verdict: Verdict;
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
