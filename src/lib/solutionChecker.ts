export interface ParsedSolution {
  solutions: string[];
  check: string | null;
}

export interface CheckResult {
  codeMatch: boolean;
  /** null when no check block exists (only code comparison) */
  outputMatch: boolean | null;
}

/**
 * Extract ```solution and ```check blocks from a solution markdown file.
 * Multiple solution blocks = alternative accepted solutions.
 */
export function parseSolution(md: string): ParsedSolution {
  const solutions: string[] = [];
  let check: string | null = null;

  const regex = /```(solution|check)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(md)) !== null) {
    const content = match[2].trimEnd();
    if (match[1] === "solution") {
      solutions.push(content);
    } else {
      check = content;
    }
  }

  return { solutions, check };
}

/** Normalize code for whitespace-tolerant comparison. */
export function normalizeCode(code: string): string {
  return code
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").trimEnd())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

export function checkSolution(
  userCode: string,
  consoleOutput: string,
  data: ParsedSolution,
): CheckResult {
  const normalizedUser = normalizeCode(userCode);
  const codeMatch = data.solutions.some(
    (sol) => normalizeCode(sol) === normalizedUser,
  );

  let outputMatch: boolean | null = null;
  if (data.check !== null) {
    outputMatch = consoleOutput.trim() === data.check.trim();
  }

  return { codeMatch, outputMatch };
}
