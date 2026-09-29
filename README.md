# AlgoCompare

AlgoCompare is a small university practice project for comparing two Python algorithm implementations. It checks whether the algorithms appear to solve the same problem by running generated test cases, compares their outputs, estimates simple time/space complexity, and reports empirical runtime measurements.

> AlgoCompare does **not** mathematically prove equivalence. It provides practical evidence from testing and lightweight static analysis.

## Features

- Compare two Python algorithms side by side
- Generate test inputs for common educational problems
- Execute both algorithms with the same inputs
- Report passed/failed output comparisons
- Estimate time complexity such as `O(1)`, `O(n)`, `O(n log n)`, `O(n²)`, and simple recursive cases
- Estimate space complexity such as `O(1)`, `O(n)`, and `O(n²)`
- Measure empirical runtime for both implementations
- Show static analysis details: function name, parameters, loops, recursion, sorting, searching, and common patterns
- Handle syntax errors, runtime errors, missing functions, sandbox safety violations, and timeouts
- Dark, responsive developer-oriented UI

## Project Structure

```text
AlgoCompare/
├── frontend/       # React + TypeScript + Vite + Tailwind CSS
├── backend/        # Node.js + Express + TypeScript API and Python runner
├── README.md
├── .gitignore
├── package-lock.json
└── package.json
```

## Architecture

```text
Frontend
   ↓
Backend API
   ↓
Static analysis + test generation
   ↓
Restricted Python execution
   ↓
Output comparison + runtime measurement
   ↓
Results UI
```

The frontend sends both code snippets and the requested number of tests to `POST /api/analyze`. The backend detects the first Python function in each snippet, generates inputs, executes each implementation in a separate Python process with a timeout and restricted builtins, compares normalized outputs, and returns a structured analysis report.

## Installation

Requirements:

- Node.js 20+
- npm
- Python 3.10+

```bash
git clone https://github.com/ParsaNrz/AlgoCompare.git
cd AlgoCompare
npm install
npm run dev
```

Development servers:

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:5050>

The Vite frontend proxies `/api` requests to the backend during development.

## Useful Commands

```bash
# Run frontend and backend together
npm run dev

# Type-check and build both apps
npm run build

# Type-check only
npm run typecheck

# Run only the backend
npm run dev -w backend

# Run only the frontend
npm run dev -w frontend
```

## Usage

1. Open the app in the browser.
2. Enter a Python function in **Algorithm A** and **Algorithm B**.
3. Each snippet should define a function, for example:

```python
def solve(arr):
    return max(arr)
```

4. Choose the approximate number of generated tests.
5. Click **Analyze Algorithms**.
6. Review:
   - Likely equivalence verdict
   - Passed/failed test count
   - Sample test outputs
   - Estimated time and space complexity
   - Runtime comparison chart
   - Static analysis notes

## Included Examples

Use the **Load Example** control in the UI to try:

- Find maximum
- Linear search
- Sum of array
- Factorial
- Fibonacci

## How the Comparison Works

AlgoCompare combines three simple methods:

1. **Output testing**
   - Generates arrays, search targets, or small numbers depending on the detected function shape.
   - Runs both implementations on the same generated inputs.
   - Counts matching and different outputs.

2. **Basic static analysis**
   - Detects function names and parameters.
   - Looks for loops, nested loops, recursion, sorting, membership/search operations, and common builtins such as `max`, `min`, and `sum`.

3. **Heuristic conclusion**
   - Returns **Likely Equivalent** when at least 95% of generated tests match and execution succeeds.
   - Returns **Likely Different** when outputs differ often.
   - Returns **Unable to compare** when syntax errors, missing functions, timeouts, or sandbox failures prevent a complete run.

## Complexity Analysis

The complexity analyzer is intentionally lightweight and educational. It recognizes common patterns:

- Constant work → `O(1)`
- Halving loop → `O(log n)`
- One loop or linear builtin → `O(n)`
- Sorting → `O(n log n)`
- Nested loops → `O(n²)`
- Simple multiple recursion, such as naive Fibonacci → `O(2^n)`

If the code does not match a supported pattern, AlgoCompare displays:

```text
Unable to determine automatically
```

## Security Notes

User-submitted Python code is executed in a separate Python process with basic protections:

- Execution timeout from the Node backend
- CPU and memory limits where supported by the operating system
- Restricted Python builtins
- Blocked imports
- Blocked dangerous calls such as `open`, `eval`, `exec`, `compile`, and `__import__`
- No intentional network or filesystem access for submitted algorithms

This is suitable for a university MVP, but it is **not a production-grade sandbox**. A real public deployment should use stronger isolation such as containers, seccomp/firejail-style restrictions, VM isolation, or a managed sandbox service.

## Limitations

- Testing cannot prove equivalence for all possible inputs.
- Generated tests are simple and focused on educational examples.
- Static complexity analysis is approximate and pattern-based.
- Runtime depends on hardware, input size, Python version, implementation details, and generated test cases.
- Only Python is supported in this version.
- The sandbox is reasonable for local practice but not enough for untrusted public execution.

## Acceptance Test Examples

### Same functionality

```python
# Algorithm A
def solve(arr):
    return max(arr)

# Algorithm B
def solve(arr):
    result = arr[0]
    for x in arr:
        if x > result:
            result = x
    return result
```

Expected verdict: **Likely Equivalent**

### Different functionality

```python
# Algorithm A
def solve(arr):
    return max(arr)

# Algorithm B
def solve(arr):
    return min(arr)
```

Expected verdict: **Likely Different**

### Same result, different efficiency

```python
# Algorithm A
def solve(arr):
    return max(arr)

# Algorithm B
def solve(arr):
    return sorted(arr)[-1]
```

Expected complexity:

```text
A: O(n)
B: O(n log n)
```

## Future Improvements

- Support more programming languages
- Better static analysis with real AST-based complexity rules
- More advanced test generation
- Formal equivalence checking for restricted algorithms
- Stronger sandboxing for production deployment
