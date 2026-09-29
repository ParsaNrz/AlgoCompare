import { analyzeCode } from '../analysis/staticAnalyzer';
import { generateTests } from '../analysis/testGenerator';
import { executePython } from './pythonExecutor';
import { AnalyzeResponse, ComparedTestResult, SandboxResultItem, StaticAnalysis } from '../types';

interface AnalyzeRequestBody {
  codeA: string;
  codeB: string;
  testCount?: number;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(',')}}`;
}

function outputsMatch(a: SandboxResultItem | undefined, b: SandboxResultItem | undefined): boolean {
  if (!a || !b || !a.ok || !b.ok) return false;
  return stableStringify(a.output) === stableStringify(b.output);
}

function formatExecutionError(prefix: string, result: { ok: boolean; errorType?: string; message?: string; stderr?: string }): string | undefined {
  if (result.ok) return undefined;
  const parts = [`${prefix}: ${result.errorType ?? 'ExecutionError'}`];
  if (result.message) parts.push(result.message);
  if (result.stderr) parts.push(result.stderr);
  return parts.join(' - ');
}

function describePatternOverlap(a: StaticAnalysis, b: StaticAnalysis): string {
  const overlap = a.patterns.filter((pattern) => b.patterns.includes(pattern));
  if (overlap.length === 0) {
    return 'Static analysis found different implementation patterns. This is not proof of different behavior; output tests are weighted more heavily.';
  }
  return `Static analysis found shared pattern(s): ${overlap.join(', ')}.`;
}

function compareComplexity(a: StaticAnalysis, b: StaticAnalysis): string | null {
  const order = ['O(1)', 'O(log n)', 'O(√n)', 'O(n)', 'O(n log n)', 'O(n√n)', 'O(n²)', 'O(n³)', 'O(2^n)'];
  const indexA = order.indexOf(a.complexity.time);
  const indexB = order.indexOf(b.complexity.time);

  if (indexA === -1 || indexB === -1) {
    return 'At least one time complexity could not be determined automatically.';
  }

  if (indexA === indexB) {
    return `Both implementations have the same estimated time complexity (${a.complexity.time}).`;
  }

  const lower = indexA < indexB ? 'Algorithm A' : 'Algorithm B';
  return `${lower} has the lower estimated asymptotic time complexity (${indexA < indexB ? a.complexity.time : b.complexity.time} vs ${indexA < indexB ? b.complexity.time : a.complexity.time}).`;
}

export async function analyzeAlgorithms(body: AnalyzeRequestBody): Promise<AnalyzeResponse> {
  const codeA = body.codeA?.trim() ?? '';
  const codeB = body.codeB?.trim() ?? '';
  const requestedCount = Number(body.testCount ?? 100);

  const analysisA = analyzeCode(codeA, 'A');
  const analysisB = analyzeCode(codeB, 'B');

  const missingMessages: string[] = [];
  if (!codeA) missingMessages.push('Algorithm A is empty.');
  if (!codeB) missingMessages.push('Algorithm B is empty.');
  if (!analysisA.functionName) missingMessages.push('Algorithm A does not contain a Python function definition.');
  if (!analysisB.functionName) missingMessages.push('Algorithm B does not contain a Python function definition.');

  if (missingMessages.length > 0) {
    return {
      verdict: 'Unable to compare',
      passed: 0,
      failed: 0,
      total: 0,
      passRate: 0,
      generatedProfile: 'not generated',
      algorithms: {
        A: {
          functionName: analysisA.functionName,
          parameters: analysisA.parameters,
          complexity: analysisA.complexity,
          runtimeMs: 0,
          staticAnalysis: analysisA,
          executionError: missingMessages.filter((message) => message.includes('A')).join(' ')
        },
        B: {
          functionName: analysisB.functionName,
          parameters: analysisB.parameters,
          complexity: analysisB.complexity,
          runtimeMs: 0,
          staticAnalysis: analysisB,
          executionError: missingMessages.filter((message) => message.includes('B')).join(' ')
        }
      },
      tests: [],
      summary: ['The comparison could not start because one or both algorithms are missing a callable function.'],
      notes: [...missingMessages, ...analysisA.warnings, ...analysisB.warnings]
    };
  }

  const generated = generateTests({ analysisA, analysisB, requestedCount });
  const [executionA, executionB] = await Promise.all([
    executePython({ code: codeA, functionName: analysisA.functionName, tests: generated.tests }),
    executePython({ code: codeB, functionName: analysisB.functionName, tests: generated.tests })
  ]);

  const byIdA = new Map(executionA.results.map((result) => [result.id, result]));
  const byIdB = new Map(executionB.results.map((result) => [result.id, result]));

  const comparedTests: ComparedTestResult[] = generated.tests.map((test) => {
    const resultA = byIdA.get(test.id);
    const resultB = byIdB.get(test.id);
    return {
      id: test.id,
      label: test.label,
      input: test.args,
      outputA: resultA?.output,
      outputB: resultB?.output,
      outputARepr: resultA?.outputRepr,
      outputBRepr: resultB?.outputRepr,
      errorA: resultA?.error,
      errorB: resultB?.error,
      match: outputsMatch(resultA, resultB)
    };
  });

  const passed = comparedTests.filter((test) => test.match).length;
  const total = comparedTests.length;
  const failed = total - passed;
  const passRate = total === 0 ? 0 : passed / total;
  const fatalErrorA = formatExecutionError('Algorithm A failed during execution', executionA);
  const fatalErrorB = formatExecutionError('Algorithm B failed during execution', executionB);
  const hasFatalError = Boolean(fatalErrorA || fatalErrorB);
  const verdict: AnalyzeResponse['verdict'] = hasFatalError
    ? 'Unable to compare'
    : passRate >= 0.95
      ? 'Likely Equivalent'
      : 'Likely Different';

  const summary: string[] = [];
  if (hasFatalError) {
    summary.push('Execution failed before a complete comparison could be made. Review the error messages and try again.');
  } else if (verdict === 'Likely Equivalent') {
    summary.push(`Both implementations produced the same output for ${passed} of ${total} generated test cases.`);
  } else {
    summary.push(`The implementations produced different outputs for ${failed} of ${total} generated test cases.`);
  }

  const complexitySummary = compareComplexity(analysisA, analysisB);
  if (complexitySummary) summary.push(complexitySummary);

  if (!hasFatalError) {
    const faster = executionA.runtimeMs === executionB.runtimeMs
      ? null
      : executionA.runtimeMs < executionB.runtimeMs
        ? 'Algorithm A'
        : 'Algorithm B';
    if (faster) {
      summary.push(`${faster} was faster in this empirical run, but runtime depends on hardware, input size, and generated tests.`);
    }
  }

  return {
    verdict,
    passed,
    failed,
    total,
    passRate,
    generatedProfile: generated.profile,
    algorithms: {
      A: {
        functionName: analysisA.functionName,
        parameters: analysisA.parameters,
        complexity: analysisA.complexity,
        runtimeMs: executionA.runtimeMs,
        staticAnalysis: analysisA,
        executionError: fatalErrorA
      },
      B: {
        functionName: analysisB.functionName,
        parameters: analysisB.parameters,
        complexity: analysisB.complexity,
        runtimeMs: executionB.runtimeMs,
        staticAnalysis: analysisB,
        executionError: fatalErrorB
      }
    },
    tests: comparedTests,
    summary,
    notes: [
      describePatternOverlap(analysisA, analysisB),
      ...generated.notes,
      ...analysisA.warnings.map((warning) => `Algorithm A: ${warning}`),
      ...analysisB.warnings.map((warning) => `Algorithm B: ${warning}`),
      'Equivalence is based on generated tests and static heuristics, not a mathematical proof.',
      'Runtime measurements are empirical; Big-O estimates are asymptotic and approximate.'
    ]
  };
}
