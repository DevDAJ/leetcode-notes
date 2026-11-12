// File extensions for LeetCode's language identifiers ("langSlug").
// The list of languages itself always comes from LeetCode, per problem; this only names the files.

const EXTENSIONS: Record<string, string> = {
  bash: "sh",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  dart: "dart",
  elixir: "ex",
  erlang: "erl",
  golang: "go",
  java: "java",
  javascript: "js",
  kotlin: "kt",
  mssql: "sql",
  mysql: "sql",
  oraclesql: "sql",
  php: "php",
  postgresql: "sql",
  python: "py",
  python3: "py",
  pythondata: "py",
  racket: "rkt",
  react: "jsx",
  ruby: "rb",
  rust: "rs",
  scala: "scala",
  swift: "swift",
  typescript: "ts",
};

/** The file extension for a LeetCode language. Unknown languages use their identifier. */
export function extensionFor(langSlug: string): string {
  return EXTENSIONS[langSlug] ?? langSlug;
}
