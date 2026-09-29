import { ComplexityEstimate, ComplexityValue, StaticAnalysis } from '../types';

const UNKNOWN_COMPLEXITY: ComplexityEstimate = {
  time: 'Unable to determine automatically',
  space: 'Unable to determine automatically',
  confidence: 'low',
  notes: ['The code does not match one of the simple educational patterns supported by this MVP.']
};

type InternalTerm =
  | {
      kind: 'known';
      nPower: number;
      logPower: number;
      notes: string[];
    }
  | {
      kind: 'unknown';
      notes: string[];
    }
  | {
      kind: 'exponential';
      notes: string[];
    };

interface ParsedLine {
  text: string;
  indent: number;
  lineNumber: number;
}

interface StatementNode {
  type: 'statement';
  text: string;
  lineNumber: number;
}

interface LoopNode {
  type: 'loop';
  kind: 'for' | 'while';
  header: string;
  indent: number;
  lineNumber: number;
  body: ParsedNode[];
}

type ParsedNode = StatementNode | LoopNode;

interface TimeAnalysisResult {
  term: InternalTerm;
  notes: string[];
  usedHeuristics: boolean;
}

interface BoundAnalysis {
  term: InternalTerm;
  variableName?: string;
  loopVariableMax?: InternalTerm;
  explanation: string;
}

interface TimeContext {
  parameters: string[];
  loopVariables: Map<string, InternalTerm>;
  functionName: string | null;
}

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
  // Be intentionally lenient here. The Python sandbox performs real syntax
  // validation, so this also lets us surface clear SyntaxError messages for
  // almost-correct definitions such as `def solve(arr)` without a colon.
  const match = code.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/m);

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

function knownTerm(nPower: number, logPower = 0, note?: string): InternalTerm {
  return { kind: 'known', nPower, logPower, notes: note ? [note] : [] };
}

function unknownTerm(note: string): InternalTerm {
  return { kind: 'unknown', notes: [note] };
}

function exponentialTerm(note: string): InternalTerm {
  return { kind: 'exponential', notes: [note] };
}

function mergeNotes(...terms: InternalTerm[]): string[] {
  return terms.flatMap((term) => term.notes);
}

function compactNotes(notes: Array<string | undefined>): string[] {
  return notes.filter((note): note is string => Boolean(note));
}

function multiplyTerms(a: InternalTerm, b: InternalTerm, note?: string): InternalTerm {
  if (a.kind === 'unknown' || b.kind === 'unknown') {
    return unknownTerm(compactNotes([note, ...mergeNotes(a, b), 'A nested or repeated cost could not be combined reliably.']).join(' '));
  }

  if (a.kind === 'exponential' || b.kind === 'exponential') {
    return exponentialTerm(compactNotes([note, ...mergeNotes(a, b)]).join(' '));
  }

  const combinedLogPower = a.logPower + b.logPower;
  if (combinedLogPower > 1) {
    return unknownTerm('The analyzer does not currently report powers of log n such as O((log n)²).');
  }

  return {
    kind: 'known',
    nPower: a.nPower + b.nPower,
    logPower: combinedLogPower,
    notes: compactNotes([note, ...mergeNotes(a, b)])
  };
}

function termScore(term: InternalTerm): number {
  if (term.kind === 'unknown') return Number.POSITIVE_INFINITY;
  if (term.kind === 'exponential') return 10_000;
  return term.nPower * 10 + term.logPower;
}

function maxTerm(a: InternalTerm, b: InternalTerm): InternalTerm {
  if (a.kind === 'unknown') return a;
  if (b.kind === 'unknown') return b;
  return termScore(a) >= termScore(b) ? a : b;
}

function maxTerms(terms: InternalTerm[]): InternalTerm {
  return terms.reduce((best, term) => maxTerm(best, term), knownTerm(0));
}

function isClose(value: number, target: number): boolean {
  return Math.abs(value - target) < 0.001;
}

function termToComplexityValue(term: InternalTerm): ComplexityValue {
  if (term.kind === 'unknown') return 'Unable to determine automatically';
  if (term.kind === 'exponential') return 'O(2^n)';

  if (term.logPower === 1 && isClose(term.nPower, 0)) return 'O(log n)';
  if (term.logPower === 1 && isClose(term.nPower, 1)) return 'O(n log n)';
  if (term.logPower > 0) return 'Unable to determine automatically';

  if (isClose(term.nPower, 0)) return 'O(1)';
  if (isClose(term.nPower, 0.5)) return 'O(√n)';
  if (isClose(term.nPower, 1)) return 'O(n)';
  if (isClose(term.nPower, 1.5)) return 'O(n√n)';
  if (isClose(term.nPower, 2)) return 'O(n²)';
  if (isClose(term.nPower, 3)) return 'O(n³)';

  return 'Unable to determine automatically';
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of value) {
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;

    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function prepareLines(code: string): ParsedLine[] {
  return code
    .replace(/\t/g, '    ')
    .split('\n')
    .map((rawLine, index) => ({ rawLine, index }))
    .map(({ rawLine, index }) => ({
      text: rawLine.trim(),
      indent: rawLine.match(/^\s*/)?.[0].length ?? 0,
      lineNumber: index + 1
    }))
    .filter((line) => line.text.length > 0 && !line.text.startsWith('def '));
}

function buildLoopTree(code: string): ParsedNode[] {
  const root: ParsedNode[] = [];
  const stack: Array<{ indent: number; nodes: ParsedNode[] }> = [{ indent: -1, nodes: root }];

  for (const line of prepareLines(code)) {
    while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    if (/^(for|while)\b.*:\s*$/.test(line.text)) {
      const loop: LoopNode = {
        type: 'loop',
        kind: line.text.startsWith('for ') ? 'for' : 'while',
        header: line.text,
        indent: line.indent,
        lineNumber: line.lineNumber,
        body: []
      };
      stack[stack.length - 1].nodes.push(loop);
      stack.push({ indent: line.indent, nodes: loop.body });
    } else {
      stack[stack.length - 1].nodes.push({ type: 'statement', text: line.text, lineNumber: line.lineNumber });
    }
  }

  return root;
}

function stripOuterWrappers(expression: string): string {
  let expr = expression.trim();
  let changed = true;

  while (changed) {
    changed = false;
    const wrapper = expr.match(/^(?:int|float|round)\s*\((.*)\)$/);
    if (wrapper) {
      expr = wrapper[1].trim();
      changed = true;
    }
  }

  return expr;
}

function stripConstantOffsets(expression: string): string {
  let expr = expression.trim();
  let previous = '';

  while (expr !== previous) {
    previous = expr;
    expr = expr
      .replace(/\s*([+\-])\s*\d+\s*$/g, '')
      .replace(/^\d+\s*([+\-])\s*/g, '')
      .trim();
  }

  return expr;
}

function isParameter(name: string, context: TimeContext): boolean {
  return context.parameters.includes(name);
}

function expressionTerm(expression: string, context: TimeContext): InternalTerm {
  let expr = stripConstantOffsets(stripOuterWrappers(expression.replace(/\s+/g, ' ').trim()));

  if (!expr) return unknownTerm(`Could not parse loop bound '${expression}'.`);
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) return knownTerm(0, 0, `Bound '${expression}' is constant.`);

  const lenMatch = expr.match(/^len\s*\(\s*([A-Za-z_]\w*)\s*\)$/);
  if (lenMatch && isParameter(lenMatch[1], context)) {
    return knownTerm(1, 0, `Bound '${expression}' is proportional to len(${lenMatch[1]}).`);
  }

  const sqrtMatch = expr.match(/^(?:math\.)?sqrt\s*\((.*)\)$/);
  if (sqrtMatch) {
    const inner = expressionTerm(sqrtMatch[1], context);
    if (inner.kind !== 'known' || inner.logPower > 0) {
      return unknownTerm(`Square-root bound '${expression}' depends on an expression that could not be classified.`);
    }
    return knownTerm(inner.nPower * 0.5, 0, `Bound '${expression}' is a square-root bound.`);
  }

  const exponentSqrtMatch = expr.match(/^(.*?)\s*(?:\*\*|\^)\s*0?\.5$/);
  if (exponentSqrtMatch) {
    const inner = expressionTerm(exponentSqrtMatch[1], context);
    if (inner.kind !== 'known' || inner.logPower > 0) {
      return unknownTerm(`Square-root bound '${expression}' depends on an expression that could not be classified.`);
    }
    return knownTerm(inner.nPower * 0.5, 0, `Bound '${expression}' is a square-root bound.`);
  }

  const productParts = splitTopLevelProduct(expr);
  if (productParts.length > 1) {
    const productTerm = productParts
      .map((part) => expressionTerm(part, context))
      .reduce((acc, term) => multiplyTerms(acc, term), knownTerm(0));
    if (productTerm.kind === 'known') {
      productTerm.notes.push(`Bound '${expression}' is a product of simpler bounds.`);
    }
    return productTerm;
  }

  if (isParameter(expr, context)) {
    return knownTerm(1, 0, `Bound '${expression}' is proportional to input parameter ${expr}.`);
  }

  const loopVariableTerm = context.loopVariables.get(expr);
  if (loopVariableTerm) {
    return {
      ...loopVariableTerm,
      notes: [`Bound '${expression}' depends on outer loop variable ${expr}.`, ...loopVariableTerm.notes]
    };
  }

  // Expressions such as n / 2 or n // 2 are still linear in n.
  const dividedByConstant = expr.match(/^(.*?)\s*(?:\/\/|\/)\s*\d+$/);
  if (dividedByConstant) {
    return expressionTerm(dividedByConstant[1], context);
  }

  return unknownTerm(`Could not confidently classify loop bound '${expression}'.`);
}

function splitTopLevelProduct(expression: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    const next = expression[index + 1];
    const previous = expression[index - 1];

    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;

    const isMultiplication = char === '*' && next !== '*' && previous !== '*' && depth === 0;
    if (isMultiplication) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function hasMembershipOperator(cleanCode: string): boolean {
  return cleanCode.split('\n').some((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith('for ') && /\b\w+\s+in\s+\w+/.test(trimmed);
  });
}

function iterableTerm(iterable: string, context: TimeContext): InternalTerm {
  const expr = iterable.trim();

  const enumerateMatch = expr.match(/^enumerate\s*\((.*)\)$/);
  if (enumerateMatch) return iterableTerm(enumerateMatch[1], context);

  const reversedMatch = expr.match(/^reversed\s*\((.*)\)$/);
  if (reversedMatch) return iterableTerm(reversedMatch[1], context);

  const zipMatch = expr.match(/^zip\s*\((.*)\)$/);
  if (zipMatch) {
    const argumentsTerms = splitTopLevelCommas(zipMatch[1]).map((part) => iterableTerm(part, context));
    return maxTerms(argumentsTerms);
  }

  if (isParameter(expr, context)) {
    return knownTerm(1, 0, `Iterating over ${expr} is linear in the input size.`);
  }

  return expressionTerm(expr, context);
}

function analyzeForLoopBound(loop: LoopNode, context: TimeContext): BoundAnalysis {
  const match = loop.header.match(/^for\s+(.+?)\s+in\s+(.+):$/);
  if (!match) {
    return {
      term: unknownTerm(`Line ${loop.lineNumber}: could not parse for-loop header '${loop.header}'.`),
      explanation: 'Unrecognized for loop.'
    };
  }

  const target = match[1].trim();
  const iterable = match[2].trim();
  const singleTarget = target.match(/^([A-Za-z_]\w*)$/)?.[1];
  const rangeMatch = iterable.match(/^range\s*\((.*)\)$/);

  if (rangeMatch) {
    const args = splitTopLevelCommas(rangeMatch[1]);
    const upperBound = args.length === 1 ? args[0] : args[1];
    const term = expressionTerm(upperBound, context);
    return {
      term,
      variableName: singleTarget,
      loopVariableMax: term,
      explanation: `Line ${loop.lineNumber}: range loop '${loop.header}' has ${termToHuman(term)} iterations.`
    };
  }

  const term = iterableTerm(iterable, context);
  const variableName = singleTarget && isParameter(iterable, context) ? undefined : singleTarget;

  return {
    term,
    variableName,
    loopVariableMax: variableName ? term : undefined,
    explanation: `Line ${loop.lineNumber}: iterating over '${iterable}' has ${termToHuman(term)} iterations.`
  };
}

function collectStatementTexts(nodes: ParsedNode[]): string[] {
  const texts: string[] = [];
  for (const node of nodes) {
    if (node.type === 'statement') {
      texts.push(node.text);
    } else {
      texts.push(...collectStatementTexts(node.body));
    }
  }
  return texts;
}

function hasIncrement(texts: string[], variable: string): boolean {
  const escaped = escapeRegExp(variable);
  const patterns = [
    new RegExp(`\\b${escaped}\\s*\\+=\\s*\\d+`),
    new RegExp(`\\b${escaped}\\s*=\\s*${escaped}\\s*\\+\\s*\\d+`),
    new RegExp(`\\b${escaped}\\s*=\\s*\\d+\\s*\\+\\s*${escaped}`)
  ];
  return texts.some((text) => patterns.some((pattern) => pattern.test(text)));
}

function hasDecrement(texts: string[], variable: string): boolean {
  const escaped = escapeRegExp(variable);
  const patterns = [
    new RegExp(`\\b${escaped}\\s*-=\\s*\\d+`),
    new RegExp(`\\b${escaped}\\s*=\\s*${escaped}\\s*-\\s*\\d+`)
  ];
  return texts.some((text) => patterns.some((pattern) => pattern.test(text)));
}

function hasMultiplicativeGrowth(texts: string[], variable: string): boolean {
  const escaped = escapeRegExp(variable);
  const patterns = [
    new RegExp(`\\b${escaped}\\s*\\*=\\s*(?:2|3|4|5|10)`),
    new RegExp(`\\b${escaped}\\s*=\\s*${escaped}\\s*\\*\\s*(?:2|3|4|5|10)`),
    new RegExp(`\\b${escaped}\\s*=\\s*(?:2|3|4|5|10)\\s*\\*\\s*${escaped}`)
  ];
  return texts.some((text) => patterns.some((pattern) => pattern.test(text)));
}

function hasMultiplicativeShrink(texts: string[], variable: string): boolean {
  const escaped = escapeRegExp(variable);
  const patterns = [
    new RegExp(`\\b${escaped}\\s*(?://=|/=)\\s*(?:2|3|4|5|10)`),
    new RegExp(`\\b${escaped}\\s*=\\s*${escaped}\\s*(?://|/)\\s*(?:2|3|4|5|10)`)
  ];
  return texts.some((text) => patterns.some((pattern) => pattern.test(text)));
}

function analyzeWhileLoopBound(loop: LoopNode, context: TimeContext): BoundAnalysis {
  const condition = loop.header.replace(/^while\s+/, '').replace(/:\s*$/, '').trim();
  const bodyTexts = collectStatementTexts(loop.body);
  const conditions = condition.split(/\band\b|\bor\b/).map((part) => part.trim()).filter(Boolean);

  for (const part of conditions) {
    const sqrtProduct = part.match(/^([A-Za-z_]\w*)\s*\*\s*\1\s*(?:<=|<)\s*(.+)$/);
    if (sqrtProduct && hasIncrement(bodyTexts, sqrtProduct[1])) {
      const base = expressionTerm(sqrtProduct[2], context);
      if (base.kind === 'known' && base.logPower === 0) {
        return {
          term: knownTerm(base.nPower * 0.5, 0, `Line ${loop.lineNumber}: '${part}' with ${sqrtProduct[1]} += constant is a square-root loop.`),
          variableName: sqrtProduct[1],
          loopVariableMax: knownTerm(base.nPower * 0.5),
          explanation: `Line ${loop.lineNumber}: condition '${part}' gives ${termToHuman(knownTerm(base.nPower * 0.5))} iterations.`
        };
      }
    }

    const sqrtFunction = part.match(/^([A-Za-z_]\w*)\s*(?:<=|<)\s*(?:math\.)?sqrt\s*\((.+)\)$/);
    if (sqrtFunction && hasIncrement(bodyTexts, sqrtFunction[1])) {
      const base = expressionTerm(sqrtFunction[2], context);
      if (base.kind === 'known' && base.logPower === 0) {
        return {
          term: knownTerm(base.nPower * 0.5, 0, `Line ${loop.lineNumber}: '${part}' is bounded by a square root.`),
          variableName: sqrtFunction[1],
          loopVariableMax: knownTerm(base.nPower * 0.5),
          explanation: `Line ${loop.lineNumber}: condition '${part}' gives ${termToHuman(knownTerm(base.nPower * 0.5))} iterations.`
        };
      }
    }
  }

  for (const part of conditions) {
    const increasing = part.match(/^([A-Za-z_]\w*)\s*(?:<=|<)\s*(.+)$/);
    if (increasing) {
      const variable = increasing[1];
      const upper = expressionTerm(increasing[2], context);
      if (hasMultiplicativeGrowth(bodyTexts, variable)) {
        return {
          term: knownTerm(0, 1, `Line ${loop.lineNumber}: ${variable} grows multiplicatively until '${increasing[2]}'.`),
          variableName: variable,
          loopVariableMax: upper,
          explanation: `Line ${loop.lineNumber}: multiplicative growth loop '${loop.header}' is logarithmic.`
        };
      }
      if (hasIncrement(bodyTexts, variable)) {
        return {
          term: upper,
          variableName: variable,
          loopVariableMax: upper,
          explanation: `Line ${loop.lineNumber}: incrementing loop '${loop.header}' has ${termToHuman(upper)} iterations.`
        };
      }
    }

    const reversedIncreasing = part.match(/^(.+)\s*(?:>=|>)\s*([A-Za-z_]\w*)$/);
    if (reversedIncreasing) {
      const variable = reversedIncreasing[2];
      const upper = expressionTerm(reversedIncreasing[1], context);
      if (hasMultiplicativeGrowth(bodyTexts, variable)) {
        return {
          term: knownTerm(0, 1, `Line ${loop.lineNumber}: ${variable} grows multiplicatively until '${reversedIncreasing[1]}'.`),
          variableName: variable,
          loopVariableMax: upper,
          explanation: `Line ${loop.lineNumber}: multiplicative growth loop '${loop.header}' is logarithmic.`
        };
      }
      if (hasIncrement(bodyTexts, variable)) {
        return {
          term: upper,
          variableName: variable,
          loopVariableMax: upper,
          explanation: `Line ${loop.lineNumber}: incrementing loop '${loop.header}' has ${termToHuman(upper)} iterations.`
        };
      }
    }
  }

  for (const part of conditions) {
    const decreasing = part.match(/^([A-Za-z_]\w*)\s*(?:>=|>)\s*(.+)$/);
    if (decreasing) {
      const variable = decreasing[1];
      const variableSize = expressionTerm(variable, context);
      if (hasMultiplicativeShrink(bodyTexts, variable)) {
        return {
          term: knownTerm(0, 1, `Line ${loop.lineNumber}: ${variable} shrinks multiplicatively.`),
          variableName: variable,
          loopVariableMax: variableSize,
          explanation: `Line ${loop.lineNumber}: multiplicative shrink loop '${loop.header}' is logarithmic.`
        };
      }
      if (hasDecrement(bodyTexts, variable)) {
        return {
          term: variableSize,
          variableName: variable,
          loopVariableMax: variableSize,
          explanation: `Line ${loop.lineNumber}: decrementing loop '${loop.header}' has ${termToHuman(variableSize)} iterations.`
        };
      }
    }
  }

  return {
    term: unknownTerm(`Line ${loop.lineNumber}: while-loop '${loop.header}' has a data-dependent or unsupported bound.`),
    explanation: `Line ${loop.lineNumber}: unable to determine while-loop bound.`
  };
}

function termToHuman(term: InternalTerm): string {
  return termToComplexityValue(term).replace('Unable to determine automatically', 'an unknown number of');
}

function statementCost(statement: StatementNode, context: TimeContext): InternalTerm {
  const text = statement.text;

  if (/\bsorted\s*\(|\.sort\s*\(/.test(text)) {
    return knownTerm(1, 1, `Line ${statement.lineNumber}: sorting is treated as O(n log n).`);
  }

  if (/\b(max|min|sum|any|all)\s*\(|\.index\s*\(/.test(text) || hasMembershipOperator(text)) {
    return knownTerm(1, 0, `Line ${statement.lineNumber}: linear builtin or membership operation is treated as O(n).`);
  }

  if (/\[[^\]]*\bfor\b[\s\S]*\]/.test(text) || /\{[^}]*\bfor\b[\s\S]*\}/.test(text)) {
    return knownTerm(1, 0, `Line ${statement.lineNumber}: comprehension is treated as O(n).`);
  }

  const callNames = [...text.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map((match) => match[1]);
  const safeCalls = new Set([
    'abs',
    'all',
    'any',
    'bool',
    'dict',
    'enumerate',
    'filter',
    'float',
    'int',
    'isinstance',
    'len',
    'list',
    'map',
    'max',
    'min',
    'pow',
    'range',
    'reversed',
    'round',
    'set',
    'slice',
    'sorted',
    'str',
    'sum',
    'tuple',
    'zip',
    'sqrt',
    'append',
    'extend',
    'pop',
    'sort',
    'index',
    'items',
    'keys',
    'values'
  ]);

  const unknownCall = callNames.find((name) => name !== context.functionName && !safeCalls.has(name));
  if (unknownCall) {
    return unknownTerm(`Line ${statement.lineNumber}: call to '${unknownCall}(...)' could hide additional work.`);
  }

  return knownTerm(0);
}

function analyzeNodes(nodes: ParsedNode[], context: TimeContext, notes: string[]): InternalTerm {
  const terms: InternalTerm[] = [knownTerm(0)];

  for (const node of nodes) {
    if (node.type === 'statement') {
      const cost = statementCost(node, context);
      if (cost.kind !== 'known' || cost.nPower > 0 || cost.logPower > 0) {
        notes.push(...cost.notes);
      }
      terms.push(cost);
      continue;
    }

    const bound = node.kind === 'for' ? analyzeForLoopBound(node, context) : analyzeWhileLoopBound(node, context);
    notes.push(bound.explanation);

    const childContext: TimeContext = {
      ...context,
      loopVariables: new Map(context.loopVariables)
    };
    if (bound.variableName && bound.loopVariableMax) {
      childContext.loopVariables.set(bound.variableName, bound.loopVariableMax);
    }

    const bodyTerm = analyzeNodes(node.body, childContext, notes);
    const perIteration = maxTerm(knownTerm(0), bodyTerm);
    const loopTerm = multiplyTerms(bound.term, perIteration, `Line ${node.lineNumber}: loop work combines its iteration count with its body cost.`);
    terms.push(loopTerm);
  }

  return maxTerms(terms);
}

function analyzeTimeComplexity(cleanCode: string, parameters: string[], functionName: string | null): TimeAnalysisResult {
  const tree = buildLoopTree(cleanCode);
  const notes: string[] = [];
  const term = analyzeNodes(
    tree,
    {
      parameters,
      loopVariables: new Map(),
      functionName
    },
    notes
  );

  return {
    term,
    notes: [...new Set(notes.filter(Boolean))],
    usedHeuristics: notes.length > 0
  };
}

function detectAllocatedLinearSpace(cleanCode: string): boolean {
  return (
    /sorted\s*\(/.test(cleanCode) ||
    /\[[^\]]*\bfor\b[\s\S]*\]/.test(cleanCode) ||
    /\b(list|set|dict)\s*\(/.test(cleanCode) ||
    /\.append\s*\(/.test(cleanCode) ||
    /\.extend\s*\(/.test(cleanCode) ||
    /\{[^}]*\bfor\b[\s\S]*\}/.test(cleanCode) ||
    /\bcopy\s*\(/.test(cleanCode) ||
    /\[:\]/.test(cleanCode)
  );
}

function analyzeSpaceComplexity(cleanCode: string, hasRecursion: boolean): { space: ComplexityValue; notes: string[] } {
  const notes: string[] = [];
  const maybeQuadraticSpace = /\[\s*\[[\s\S]*\]\s*for\b/.test(cleanCode) || /matrix|grid|table|dp\s*=\s*\[\s*\[/.test(cleanCode);
  const listAssignments = [...cleanCode.matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*(?:\[\]|list\s*\(\s*\))/gm)].map((match) => match[1]);
  const returnedGrowingCollection = listAssignments.find((name) => {
    const escaped = escapeRegExp(name);
    return new RegExp(`\\b${escaped}\\.append\\s*\\(`).test(cleanCode) && new RegExp(`return\\s+${escaped}\\b`).test(cleanCode);
  });

  let space: ComplexityValue = 'O(1)';

  if (maybeQuadraticSpace) {
    space = 'O(n²)';
    notes.push('Space: a nested collection or matrix-like allocation suggests O(n²) memory.');
  } else if (detectAllocatedLinearSpace(cleanCode)) {
    space = 'O(n)';
    if (returnedGrowingCollection) {
      notes.push(
        `Space: collection '${returnedGrowingCollection}' grows with the input and is returned; output space can be O(n), while the additional scalar working space appears O(1).`
      );
    } else {
      notes.push('Space: an auxiliary collection or copy can grow linearly with the input.');
    }
  }

  if (hasRecursion) {
    space = space === 'O(n²)' ? space : 'O(n)';
    notes.push('Space: recursion uses stack frames, which are estimated as O(n) for this simple pattern.');
  }

  if (notes.length === 0) {
    notes.push('Space: no input-sized auxiliary collection or recursion stack was detected.');
  }

  return { space, notes };
}

function estimateRecursiveComplexity(cleanCode: string, functionName: string): ComplexityEstimate | null {
  const escapedName = escapeRegExp(functionName);
  const recursiveCalls = Math.max(0, countMatches(cleanCode, new RegExp(`\\b${escapedName}\\s*\\(`, 'g')) - 1);

  if (recursiveCalls === 0) return null;

  const spaceAnalysis = analyzeSpaceComplexity(cleanCode, true);
  const notes: string[] = [];

  if (recursiveCalls >= 2 || /\bn\s*-\s*1[\s\S]*\bn\s*-\s*2/.test(cleanCode)) {
    notes.push('Time: multiple recursive calls suggest exponential time, as in naive Fibonacci.');
    return {
      time: 'O(2^n)',
      space: spaceAnalysis.space,
      confidence: 'medium',
      notes: [...notes, ...spaceAnalysis.notes]
    };
  }

  notes.push('Time: one self-recursive call with a smaller argument suggests linear recursion depth.');
  return {
    time: 'O(n)',
    space: spaceAnalysis.space,
    confidence: 'medium',
    notes: [...notes, ...spaceAnalysis.notes]
  };
}

function estimateComplexity(
  code: string,
  analysisBits: {
    functionName: string | null;
    parameters: string[];
    hasRecursion: boolean;
  }
): ComplexityEstimate {
  const cleanCode = stripStringsAndComments(code);

  if (!analysisBits.functionName) {
    return {
      ...UNKNOWN_COMPLEXITY,
      notes: ['No Python function definition was found. Add a function such as def solve(arr): ...']
    };
  }

  if (analysisBits.hasRecursion) {
    const recursiveEstimate = estimateRecursiveComplexity(cleanCode, analysisBits.functionName);
    if (recursiveEstimate) return recursiveEstimate;
  }

  const timeAnalysis = analyzeTimeComplexity(cleanCode, analysisBits.parameters, analysisBits.functionName);
  const time = termToComplexityValue(timeAnalysis.term);
  const spaceAnalysis = analyzeSpaceComplexity(cleanCode, false);

  if (time === 'Unable to determine automatically') {
    return {
      time,
      space: spaceAnalysis.space,
      confidence: 'low',
      notes: [
        ...timeAnalysis.notes,
        ...timeAnalysis.term.notes,
        ...spaceAnalysis.notes,
        'Time: the loop bounds, updates, or helper calls do not match the supported educational patterns.'
      ]
    };
  }

  const confidence: ComplexityEstimate['confidence'] = timeAnalysis.usedHeuristics ? 'high' : 'medium';
  const notes = [
    ...timeAnalysis.notes,
    ...timeAnalysis.term.notes,
    `Time: combined recognized loop and statement costs give ${time}.`,
    ...spaceAnalysis.notes
  ];

  return {
    time,
    space: spaceAnalysis.space,
    confidence,
    notes: [...new Set(notes.filter(Boolean))]
  };
}

export function analyzeCode(code: string, label: 'A' | 'B'): StaticAnalysis {
  const cleanCode = stripStringsAndComments(code);
  const { name: functionName, parameters } = findFirstFunction(code);
  const returnCount = countMatches(cleanCode, /^\s*return\b/gm);
  const loopCount = countMatches(cleanCode, /^\s*(for|while)\b/gm);
  const hasNestedLoops = detectNestedLoops(cleanCode);
  const hasSorting = /\bsorted\s*\(|\.sort\s*\(/.test(cleanCode);
  const membershipOperator = hasMembershipOperator(cleanCode);
  const usesLinearBuiltin = /\b(max|min|sum|any|all)\s*\(|\.index\s*\(/.test(cleanCode) || membershipOperator;
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
  if (/\.index\s*\(/.test(cleanCode) || membershipOperator) patterns.push('search/membership');
  if (/while\s+[^:]*\*\s*[A-Za-z_]\w*\s*(?:<=|<)/.test(cleanCode) || /sqrt\s*\(/.test(cleanCode)) patterns.push('square-root bound');
  if (/\*=\s*(?:2|3|4|5|10)|(?:\/\/=|\/=)\s*(?:2|3|4|5|10)/.test(cleanCode)) patterns.push('logarithmic update');
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
    parameters,
    hasRecursion
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
