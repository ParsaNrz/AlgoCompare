export interface ExamplePair {
  id: string;
  name: string;
  description: string;
  codeA: string;
  codeB: string;
  suggestedTests: number;
}

export const examples: ExamplePair[] = [
  {
    id: 'find-maximum',
    name: 'Find maximum',
    description: 'Compares a linear scan with sorting-based maximum selection.',
    suggestedTests: 100,
    codeA: `def solve(arr):
    result = arr[0]
    for x in arr:
        if x > result:
            result = x
    return result`,
    codeB: `def solve(arr):
    return sorted(arr)[-1]`
  },
  {
    id: 'linear-search',
    name: 'Linear search',
    description: 'Returns the index of a target value, or -1 when missing.',
    suggestedTests: 100,
    codeA: `def solve(arr, target):
    for i, x in enumerate(arr):
        if x == target:
            return i
    return -1`,
    codeB: `def solve(arr, target):
    if target in arr:
        return arr.index(target)
    return -1`
  },
  {
    id: 'sum-array',
    name: 'Sum of array',
    description: 'Compares manual accumulation with Python sum.',
    suggestedTests: 100,
    codeA: `def solve(arr):
    total = 0
    for x in arr:
        total += x
    return total`,
    codeB: `def solve(arr):
    return sum(arr)`
  },
  {
    id: 'factorial',
    name: 'Factorial',
    description: 'Compares iterative and recursive factorial implementations.',
    suggestedTests: 40,
    codeA: `def solve(n):
    result = 1
    for value in range(2, n + 1):
        result *= value
    return result`,
    codeB: `def solve(n):
    if n <= 1:
        return 1
    return n * solve(n - 1)`
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci',
    description: 'Compares iterative Fibonacci with the simple recursive definition.',
    suggestedTests: 25,
    codeA: `def solve(n):
    if n <= 1:
        return n
    previous = 0
    current = 1
    for _ in range(2, n + 1):
        previous, current = current, previous + current
    return current`,
    codeB: `def solve(n):
    if n <= 1:
        return n
    return solve(n - 1) + solve(n - 2)`
  }
];
