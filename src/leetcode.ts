// LeetCode API access and README rendering. No VS Code imports, so it can be tested with plain Node.

import { htmlToMarkdown } from "./markdown";

export interface Problem {
  number: string;
  title: string;
  slug: string;
  difficulty: string;
  topics: string[];
}

/** A language LeetCode accepts for a problem, with its starter code. */
export interface Snippet {
  lang: string;
  langSlug: string;
  code: string;
}

export interface Details {
  /** LeetCode's internal id, which differs from the number shown on the site. */
  questionId: string;
  statement: string;
  snippets: Snippet[];
  /** One entry per example; each entry has one line per argument. */
  testcases: string[];
}

/** The two browser cookies that identify a signed-in LeetCode session. */
export interface Auth {
  session: string;
  csrf: string;
}

/** LeetCode refused the request because the session is missing, wrong or expired. */
export class SignInError extends Error {
  constructor() {
    super("LeetCode rejected your sign-in. Your session may have expired.");
  }
}

const BASE = "https://leetcode.com";
const FIELDS = "questionFrontendId title titleSlug difficulty topicTags { name }";

const SEARCH = `
query ($filters: QuestionListFilterInput) {
  questionList(categorySlug: "", limit: 20, skip: 0, filters: $filters) {
    data { ${FIELDS} }
  }
}`;

const BY_SLUG = `
query ($slug: String!) {
  question(titleSlug: $slug) { ${FIELDS} }
}`;

const DETAILS = `
query ($slug: String!) {
  question(titleSlug: $slug) {
    questionId content isPaidOnly exampleTestcaseList
    codeSnippets { lang langSlug code }
  }
}`;

const WHO_AM_I = `query { userStatus { isSignedIn username } }`;

export const DEFAULT_TEMPLATE = `# {number}. {title}

- **Link:** {url}
- **Difficulty:** {difficulty}
- **Topics:** {topics}

## Problem

{statement}

## Intuition

<!-- What was the key observation? -->

## Approach

<!-- Step-by-step explanation of the solution. -->

## Complexity

- **Time:** O()
- **Space:** O()

## Notes

<!-- Mistakes made, alternatives considered, related problems. -->
`;

interface RawQuestion {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: string;
  topicTags: { name: string }[];
}

function headers(auth: Auth | undefined, referer: string): Record<string, string> {
  const result: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: BASE,
    Referer: referer,
    "User-Agent": "leetcode-notes-vscode-extension",
  };
  if (auth) {
    result.Cookie = `LEETCODE_SESSION=${auth.session}; csrftoken=${auth.csrf}`;
    result["x-csrftoken"] = auth.csrf;
  }
  return result;
}

/** Sends a request to LeetCode and returns the parsed JSON. A body makes it a POST. */
async function request(path: string, auth: Auth | undefined, referer: string, body?: object): Promise<any> {
  const response = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: headers(auth, referer),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 || response.status === 403) {
    throw new SignInError();
  }
  if (response.status === 429) {
    throw new Error("LeetCode is rate-limiting you. Wait a moment and try again.");
  }
  if (!response.ok) {
    // LeetCode sits behind bot protection that can turn away tools; it answers those with odd codes such as 499.
    const hint = auth ? " It may be blocking requests that do not come from a browser, or your session may have expired." : "";
    throw new Error(`LeetCode returned HTTP ${response.status}.${hint}`);
  }
  return response.json();
}

async function graphql(query: string, variables: object = {}, auth?: Auth): Promise<any> {
  const body = await request("/graphql", auth, BASE, { query, variables });
  if (body.errors?.length) {
    throw new Error(body.errors[0].message);
  }
  return body.data;
}

function toProblem(raw: RawQuestion): Problem {
  return {
    number: raw.questionFrontendId,
    title: raw.title,
    slug: raw.titleSlug,
    difficulty: raw.difficulty,
    topics: raw.topicTags.map((tag) => tag.name),
  };
}

/** Extracts the slug from a leetcode.com problem URL, if the text is one. */
export function slugFromUrl(text: string): string | undefined {
  return /leetcode\.(?:com|cn)\/problems\/([\w-]+)/.exec(text)?.[1];
}

/** Finds problems by number, title words, or a problem URL. */
export async function searchProblems(text: string): Promise<Problem[]> {
  const query = text.trim();
  if (!query) {
    return [];
  }
  const slug = slugFromUrl(query);
  if (slug) {
    const data = await graphql(BY_SLUG, { slug });
    return data.question ? [toProblem(data.question)] : [];
  }
  const data = await graphql(SEARCH, { filters: { searchKeywords: query } });
  const problems: Problem[] = data.questionList.data.map(toProblem);
  // Put an exact number match first, so typing "15" and pressing Enter picks problem 15.
  return problems.sort((a, b) => Number(b.number === query) - Number(a.number === query));
}

/**
 * Fetches a problem's statement, starter code and example inputs.
 * Premium problems only return their content when signed in with a premium account.
 */
export async function fetchDetails(slug: string, auth?: Auth): Promise<Details> {
  const question = (await graphql(DETAILS, { slug }, auth)).question;
  if (!question) {
    throw new Error(`LeetCode has no problem called "${slug}".`);
  }
  let statement: string;
  if (question.content) {
    statement = htmlToMarkdown(question.content);
  } else if (question.isPaidOnly) {
    statement = "*This is a premium problem, so its statement is not publicly available.*";
  } else {
    statement = "*The statement could not be loaded.*";
  }
  return {
    questionId: question.questionId,
    statement,
    snippets: question.codeSnippets ?? [],
    testcases: question.exampleTestcaseList ?? [],
  };
}

/** Returns the username the session belongs to, or undefined if it is not signed in. */
export async function whoAmI(auth: Auth): Promise<string | undefined> {
  const status = (await graphql(WHO_AM_I, {}, auth)).userStatus;
  return status?.isSignedIn ? status.username : undefined;
}

/** Polls LeetCode until a run or submission has been judged. */
async function waitForResult(id: string | number, auth: Auth, referer: string): Promise<any> {
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const result = await request(`/submissions/detail/${id}/check/`, auth, referer);
    if (result.state === "SUCCESS") {
      return result;
    }
  }
  throw new Error("Timed out waiting for LeetCode's result.");
}

/** Runs code against the given inputs on LeetCode's servers, without submitting it. */
export async function runTests(
  slug: string,
  questionId: string,
  langSlug: string,
  code: string,
  input: string,
  auth: Auth
): Promise<any> {
  const referer = `${BASE}/problems/${slug}/`;
  const started = await request(`/problems/${slug}/interpret_solution/`, auth, referer, {
    lang: langSlug,
    question_id: questionId,
    typed_code: code,
    data_input: input,
  });
  if (!started.interpret_id) {
    throw new Error(started.error ?? "LeetCode did not start the run.");
  }
  return waitForResult(started.interpret_id, auth, referer);
}

/** Submits code as a real submission on the signed-in account. */
export async function submit(
  slug: string,
  questionId: string,
  langSlug: string,
  code: string,
  auth: Auth
): Promise<any> {
  const referer = `${BASE}/problems/${slug}/`;
  const started = await request(`/problems/${slug}/submit/`, auth, referer, {
    lang: langSlug,
    question_id: questionId,
    typed_code: code,
  });
  if (!started.submission_id) {
    throw new Error(started.error ?? "LeetCode did not accept the submission.");
  }
  return waitForResult(started.submission_id, auth, referer);
}

export function folderName(problem: Problem): string {
  return `${problem.number}-${problem.slug}`;
}

export function renderReadme(
  problem: Problem,
  statement: string,
  template: string = DEFAULT_TEMPLATE
): string {
  const values: Record<string, string> = {
    number: problem.number,
    title: problem.title,
    url: `${BASE}/problems/${problem.slug}/`,
    difficulty: problem.difficulty,
    topics: problem.topics.join(", ") || "-",
    statement,
  };
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}
