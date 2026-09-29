import assert from 'node:assert/strict';
import { analyzeCode } from './staticAnalyzer';
import { generateTests } from './testGenerator';
import { analyzeAlgorithms } from '../services/comparisonService';

const PRIME_NAIVE = `def solve(n):
    primes = []
    for x in range(2, n + 1):
        is_prime = True
        for d in range(2, x):
            if x % d == 0:
                is_prime = False
                break
        if is_prime:
            primes.append(x)
    return primes`;

const PRIME_SQRT = `def solve(n):
    primes = []
    for x in range(2, n + 1):
        is_prime = True
        d = 2
        while d * d <= x:
            if x % d == 0:
                is_prime = False
                break
            d += 1
        if is_prime:
            primes.append(x)
    return primes`;

const SIEVE = `def solve(n):
    if n < 2:
        return []

    is_prime = [True] * (n + 1)
    is_prime[0] = False
    is_prime[1] = False

    p = 2

    while p * p <= n:
        if is_prime[p]:
            for multiple in range(p * p, n + 1, p):
                is_prime[multiple] = False
        p += 1

    return [i for i in range(2, n + 1) if is_prime[i]]`;

function expectTime(name: string, code: string, expected: string): void {
  const analysis = analyzeCode(code, 'A');
  assert.equal(analysis.complexity.time, expected, `${name} should be ${expected}`);
  console.log(`✓ ${name}: ${analysis.complexity.time}`);
}

function expectSpace(name: string, code: string, expected: string): void {
  const analysis = analyzeCode(code, 'A');
  assert.equal(analysis.complexity.space, expected, `${name} space should be ${expected}`);
  console.log(`✓ ${name} space: ${analysis.complexity.space}`);
}

expectTime(
  'linear scan',
  `def solve(arr):
    total = 0
    for x in arr:
        total += x
    return total`,
  'O(n)'
);

expectTime(
  'nested n-by-n loops',
  `def solve(n):
    count = 0
    for i in range(n):
        for j in range(n):
            count += 1
    return count`,
  'O(n²)'
);

expectTime(
  'doubling counter loop',
  `def solve(n):
    i = 1
    while i < n:
        i *= 2
    return i`,
  'O(log n)'
);

expectTime(
  'square-root while loop',
  `def solve(n):
    i = 1
    while i * i <= n:
        i += 1
    return i`,
  'O(√n)'
);

expectTime('outer n loop with square-root inner loop', PRIME_SQRT, 'O(n√n)');

expectTime('Sieve of Eratosthenes', SIEVE, 'O(n log log n)');
expectSpace('Sieve of Eratosthenes', SIEVE, 'O(n)');

expectTime(
  'sorting implementation',
  `def solve(arr):
    return sorted(arr)`,
  'O(n log n)'
);

expectTime(
  'recursive factorial',
  `def solve(n):
    if n <= 1:
        return 1
    return n * solve(n - 1)`,
  'O(n)'
);

expectSpace(
  'recursive factorial',
  `def solve(n):
    if n <= 1:
        return 1
    return n * solve(n - 1)`,
  'O(n)'
);

expectTime(
  'unknown data-dependent while loop',
  `def solve(n):
    i = 0
    while should_continue(i):
        i += 1
    return i`,
  'Unable to determine automatically'
);

expectTime('naive prime generator', PRIME_NAIVE, 'O(n²)');
expectTime('sqrt prime generator', PRIME_SQRT, 'O(n√n)');
expectSpace('naive prime generator', PRIME_NAIVE, 'O(n)');
expectSpace('sqrt prime generator', PRIME_SQRT, 'O(n)');

const analysisA = analyzeCode(PRIME_NAIVE, 'A');
const analysisB = analyzeCode(PRIME_SQRT, 'B');
const generated = generateTests({ analysisA, analysisB, requestedCount: 12 });

assert.equal(generated.profile, 'single-number');
assert.equal(generated.tests.length, 12);
for (const test of generated.tests) {
  assert.equal(test.args.length, 1, 'prime tests should pass one argument');
  assert.equal(typeof test.args[0], 'number', 'prime tests should use scalar integer n');
}
const tenCase = generated.tests.find((test) => test.args[0] === 10);
assert.ok(tenCase, 'solve(10) should be generated for scalar numeric functions');
assert.deepEqual(tenCase.args, [10], 'the executor argument list should call solve(10), not solve([10])');
assert.notDeepEqual(tenCase.args, [[10]], 'scalar numeric functions must not receive array-wrapped integers');
console.log('✓ prime generator inputs are scalar integers and include solve(10), not solve([10])');

async function runEquivalenceRegression(): Promise<void> {
  const result = await analyzeAlgorithms({ codeA: PRIME_NAIVE, codeB: SIEVE, testCount: 12 });
  assert.equal(result.verdict, 'Likely Equivalent');
  assert.equal(result.algorithms.A.complexity.time, 'O(n²)');
  assert.equal(result.algorithms.B.complexity.time, 'O(n log log n)');
  assert.equal(result.generatedProfile, 'single-number');
  assert.equal(result.passed, result.total);
  for (const test of result.tests) {
    assert.equal(test.input.length, 1, 'equivalence tests should pass one argument');
    assert.equal(typeof test.input[0], 'number', 'equivalence tests should use scalar n inputs');
  }
  console.log('✓ naive prime and sieve implementations are likely equivalent with scalar integer tests');
}

runEquivalenceRegression()
  .then(() => {
    console.log('All static analyzer regression tests passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
