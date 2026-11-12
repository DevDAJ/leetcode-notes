// Turns LeetCode's judge responses into readable text. Every field is treated as optional,
// because the responses are undocumented and differ between verdicts.

function errorText(result: any): string | undefined {
  return result.full_compile_error || result.compile_error || result.full_runtime_error || result.runtime_error;
}

function block(label: string, value: unknown): string[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  const text = Array.isArray(value) ? value.join("\n") : String(value);
  const lines = text.replace(/\n+$/, "").split("\n");
  return lines.length === 1 ? [`${label}: ${lines[0]}`] : [`${label}:`, ...lines.map((line) => `  ${line}`)];
}

/** One-line summary for a notification, such as "Accepted" or "Wrong Answer (2/3 passed)". */
export function verdict(result: any): string {
  let status: string = result.status_msg ?? "Unknown result";
  // A test run reports "Accepted" when the code merely ran; correctness is a separate flag.
  if (status === "Accepted" && result.correct_answer === false) {
    status = "Wrong Answer";
  }
  const total = result.total_testcases;
  const passed = result.total_correct;
  return typeof total === "number" && typeof passed === "number" && status !== "Accepted"
    ? `${status} (${passed}/${total} passed)`
    : status;
}

/** Full report for a test run. `input` is the text that was sent, used to label each case. */
export function formatRun(result: any, input: string): string {
  const lines = [verdict(result), ""];
  const error = errorText(result);
  if (error) {
    return [...lines, error].join("\n");
  }

  const answers: string[] = result.code_answer ?? [];
  const expected: string[] = result.expected_code_answer ?? [];
  const stdout: string[] = result.std_output_list ?? [];
  const compare: string = result.compare_result ?? "";
  const count: number = result.total_testcases ?? answers.filter((answer) => answer !== "").length;

  // Each case has the same number of input lines, one per argument.
  const inputLines = input.split("\n");
  const perCase = count > 0 && inputLines.length % count === 0 ? inputLines.length / count : 0;

  for (let index = 0; index < count; index++) {
    const mark = compare[index] === "1" ? "passed" : compare[index] === "0" ? "FAILED" : "";
    lines.push(`Case ${index + 1}${mark ? ` — ${mark}` : ""}`);
    if (perCase) {
      lines.push(...block("  Input", inputLines.slice(index * perCase, (index + 1) * perCase)));
    }
    lines.push(...block("  Output", answers[index]));
    lines.push(...block("  Expected", expected[index]));
    lines.push(...block("  Stdout", stdout[index]));
    lines.push("");
  }
  lines.push(...block("Runtime", result.status_runtime), ...block("Memory", result.status_memory));
  return lines.join("\n");
}

/** Full report for a submission. */
export function formatSubmission(result: any): string {
  const lines = [verdict(result), ""];
  const error = errorText(result);
  if (error) {
    lines.push(error, "");
  }
  if (typeof result.total_testcases === "number") {
    lines.push(`Test cases passed: ${result.total_correct ?? "?"}/${result.total_testcases}`);
  }
  if (result.status_msg === "Accepted") {
    const beats = (value: unknown) => (typeof value === "number" ? ` (beats ${value.toFixed(1)}%)` : "");
    lines.push(`Runtime: ${result.status_runtime ?? "?"}${beats(result.runtime_percentile)}`);
    lines.push(`Memory: ${result.status_memory ?? "?"}${beats(result.memory_percentile)}`);
  } else {
    lines.push(...block("Failing input", result.input_formatted || result.last_testcase || result.input));
    lines.push(...block("Output", result.code_output));
    lines.push(...block("Expected", result.expected_output));
    lines.push(...block("Stdout", result.std_output));
  }
  return lines.join("\n");
}
