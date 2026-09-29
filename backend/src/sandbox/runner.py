#!/usr/bin/env python3
"""Small Python runner used by the AlgoCompare backend.

This is a teaching-oriented sandbox, not a production security boundary. It uses
AST checks, restricted builtins, process isolation, memory/CPU limits where
available, and a Node-side timeout.
"""

from __future__ import annotations

import ast
import contextlib
import copy
import io
import json
import math
import sys
import time
import traceback
from types import MappingProxyType
from typing import Any

try:
    import resource
except Exception:  # pragma: no cover - resource is unavailable on some systems
    resource = None

DANGEROUS_NAMES = {
    "__import__",
    "open",
    "eval",
    "exec",
    "compile",
    "input",
    "globals",
    "locals",
    "vars",
    "dir",
    "help",
    "breakpoint",
    "getattr",
    "setattr",
    "delattr",
    "memoryview",
}

SAFE_BUILTINS = MappingProxyType(
    {
        "abs": abs,
        "all": all,
        "any": any,
        "bool": bool,
        "dict": dict,
        "enumerate": enumerate,
        "filter": filter,
        "float": float,
        "int": int,
        "isinstance": isinstance,
        "len": len,
        "list": list,
        "map": map,
        "max": max,
        "min": min,
        "pow": pow,
        "range": range,
        "reversed": reversed,
        "round": round,
        "set": set,
        "slice": slice,
        "sorted": sorted,
        "str": str,
        "sum": sum,
        "tuple": tuple,
        "zip": zip,
        "Exception": Exception,
        "ValueError": ValueError,
        "TypeError": TypeError,
        "IndexError": IndexError,
        "KeyError": KeyError,
        "print": lambda *args, **kwargs: None,
    }
)


class SafetyError(Exception):
    pass


class SafetyVisitor(ast.NodeVisitor):
    def visit_Import(self, node: ast.Import) -> Any:
        raise SafetyError("Import statements are disabled in the AlgoCompare sandbox.")

    def visit_ImportFrom(self, node: ast.ImportFrom) -> Any:
        raise SafetyError("Import statements are disabled in the AlgoCompare sandbox.")

    def visit_Call(self, node: ast.Call) -> Any:
        if isinstance(node.func, ast.Name) and node.func.id in DANGEROUS_NAMES:
            raise SafetyError(f"Use of '{node.func.id}' is blocked in the AlgoCompare sandbox.")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> Any:
        if node.attr.startswith("__"):
            raise SafetyError("Dunder attribute access is blocked in the AlgoCompare sandbox.")
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> Any:
        if node.id in DANGEROUS_NAMES:
            raise SafetyError(f"Use of '{node.id}' is blocked in the AlgoCompare sandbox.")
        self.generic_visit(node)


def apply_resource_limits() -> None:
    if resource is None:
        return

    try:
        resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    except Exception:
        pass

    try:
        memory_bytes = 512 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    except Exception:
        pass


def first_function_name(tree: ast.AST) -> str | None:
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            return node.name
    return None


def normalize(value: Any, depth: int = 0) -> Any:
    if depth > 8:
        return repr(value)

    if value is None or isinstance(value, (str, bool, int)):
        return value

    if isinstance(value, float):
        return value if math.isfinite(value) else repr(value)

    if isinstance(value, (list, tuple)):
        return [normalize(item, depth + 1) for item in value]

    if isinstance(value, set):
        normalized_items = [normalize(item, depth + 1) for item in value]
        return sorted(normalized_items, key=repr)

    if isinstance(value, dict):
        normalized_dict: dict[str, Any] = {}
        for key in sorted(value.keys(), key=repr):
            normalized_dict[str(normalize(key, depth + 1))] = normalize(value[key], depth + 1)
        return normalized_dict

    return repr(value)


def load_payload() -> dict[str, Any]:
    if len(sys.argv) != 2:
        raise ValueError("Runner expected a single input JSON path.")

    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    apply_resource_limits()

    try:
        payload = load_payload()
        code = payload.get("code", "")
        requested_function_name = payload.get("functionName")
        tests = payload.get("tests", [])

        tree = ast.parse(code, filename="<submitted_algorithm>")
        SafetyVisitor().visit(tree)
        function_name = requested_function_name or first_function_name(tree)
        if not function_name:
            raise ValueError("No function definition was found.")

        globals_env: dict[str, Any] = {
            "__builtins__": SAFE_BUILTINS,
            "math": math,
        }

        compiled = compile(tree, filename="<submitted_algorithm>", mode="exec")
        with contextlib.redirect_stdout(io.StringIO()):
            exec(compiled, globals_env, globals_env)

        candidate = globals_env.get(function_name)
        if not callable(candidate):
            raise ValueError(f"Function '{function_name}' was not found after executing the code.")

        results = []
        total_runtime_ms = 0.0

        for test in tests:
            test_id = test.get("id")
            args = copy.deepcopy(test.get("args", []))
            start = time.perf_counter()
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    output = candidate(*args)
                elapsed_ms = (time.perf_counter() - start) * 1000
                total_runtime_ms += elapsed_ms
                normalized = normalize(output)
                results.append(
                    {
                        "id": test_id,
                        "ok": True,
                        "output": normalized,
                        "outputRepr": repr(output),
                        "runtimeMs": elapsed_ms,
                    }
                )
            except Exception as exc:  # Return per-test runtime errors as data.
                elapsed_ms = (time.perf_counter() - start) * 1000
                total_runtime_ms += elapsed_ms
                results.append(
                    {
                        "id": test_id,
                        "ok": False,
                        "error": f"{type(exc).__name__}: {exc}",
                        "traceback": "".join(traceback.format_exception_only(type(exc), exc)).strip(),
                        "runtimeMs": elapsed_ms,
                    }
                )

        print(
            json.dumps(
                {
                    "ok": True,
                    "functionName": function_name,
                    "runtimeMs": total_runtime_ms,
                    "results": results,
                },
                allow_nan=False,
            )
        )
    except SyntaxError as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "runtimeMs": 0,
                    "results": [],
                    "errorType": "SyntaxError",
                    "message": f"{exc.msg} at line {exc.lineno}",
                }
            )
        )
    except SafetyError as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "runtimeMs": 0,
                    "results": [],
                    "errorType": "SandboxSafetyError",
                    "message": str(exc),
                }
            )
        )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "runtimeMs": 0,
                    "results": [],
                    "errorType": type(exc).__name__,
                    "message": str(exc),
                }
            )
        )


if __name__ == "__main__":
    main()
