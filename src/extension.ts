import * as path from "path";
import * as vscode from "vscode";
import { extensionFor } from "./languages";
import {
  Auth,
  DEFAULT_TEMPLATE,
  Problem,
  SignInError,
  Snippet,
  fetchDetails,
  folderName,
  renderReadme,
  runTests,
  searchProblems,
  submit,
  whoAmI,
} from "./leetcode";
import { formatRun, formatSubmission, verdict } from "./results";
import { FileNode, PROBLEM_FOLDER, ProblemNode, ProblemsProvider, README, TESTCASES } from "./sidebar";

const SESSION_KEY = "leetcodeNotes.session";
const CSRF_KEY = "leetcodeNotes.csrf";
const LAST_LANGUAGE_KEY = "leetcodeNotes.lastLanguage";

let context: vscode.ExtensionContext;
let output: vscode.OutputChannel;
const problems = new ProblemsProvider();

interface ProblemItem extends vscode.QuickPickItem {
  problem: Problem;
}

interface SnippetItem extends vscode.QuickPickItem {
  snippet: Snippet;
}

export function activate(extensionContext: vscode.ExtensionContext) {
  context = extensionContext;
  output = vscode.window.createOutputChannel("LeetCode");
  // Commands run from the side panel or an editor button receive the clicked item as `target`.
  const commands: Record<string, (target?: unknown) => Promise<void>> = {
    "leetcodeNotes.newProblem": newProblem,
    "leetcodeNotes.runTests": runTestsCommand,
    "leetcodeNotes.submit": submitCommand,
    "leetcodeNotes.signIn": async () => void (await signIn()),
    "leetcodeNotes.signOut": signOut,
    "leetcodeNotes.refresh": async () => problems.refresh(),
    "leetcodeNotes.openOnLeetCode": openOnLeetCode,
  };
  for (const [id, handler] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, (target) => guard(() => handler(target))));
  }

  // Keep the side panel in step with folders and files added or removed on disk.
  // Only the top two levels matter: problem folders and the files directly inside them.
  const root = vscode.workspace.workspaceFolders?.[0];
  const watcher = vscode.workspace.createFileSystemWatcher(
    root ? new vscode.RelativePattern(root, "{*,*/*}") : "{*,*/*}",
    false,
    true,
    false
  );
  watcher.onDidCreate(() => problems.refresh());
  watcher.onDidDelete(() => problems.refresh());

  context.subscriptions.push(
    output,
    watcher,
    vscode.window.registerTreeDataProvider("leetcodeNotes.problems", problems)
  );
  void getAuth().then((auth) => setSignedIn(auth !== undefined));
}

/** Tells the side panel whether to offer Sign In or Sign Out. */
function setSignedIn(signedIn: boolean) {
  void vscode.commands.executeCommand("setContext", "leetcodeNotes.signedIn", signedIn);
}

async function openOnLeetCode(target?: unknown) {
  if (target instanceof ProblemNode) {
    await vscode.env.openExternal(vscode.Uri.parse(`https://leetcode.com/problems/${target.slug}/`));
  }
}

export function deactivate() {}

/** Runs a command and reports any failure as a notification. */
async function guard(handler: () => Promise<void>) {
  try {
    await handler();
  } catch (error) {
    if (error instanceof SignInError) {
      const choice = await vscode.window.showErrorMessage(error.message, "Sign In");
      if (choice) {
        await guard(async () => void (await signIn()));
      }
    } else {
      vscode.window.showErrorMessage(`LeetCode: ${(error as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

async function getAuth(): Promise<Auth | undefined> {
  const session = await context.secrets.get(SESSION_KEY);
  const csrf = await context.secrets.get(CSRF_KEY);
  return session && csrf ? { session, csrf } : undefined;
}

/** Returns the saved sign-in, asking the user to sign in first if there is none. */
async function requireAuth(): Promise<Auth | undefined> {
  return (await getAuth()) ?? (await signIn());
}

/**
 * Asks for the two LeetCode cookies and stores them in the editor's encrypted secret storage.
 * LeetCode has no official sign-in for tools, so the browser's session cookies are the only way.
 */
async function signIn(): Promise<Auth | undefined> {
  const ask = (name: string) =>
    vscode.window.showInputBox({
      title: `LeetCode sign-in: ${name} cookie`,
      prompt: `In your browser, open leetcode.com while signed in, then DevTools → Application → Cookies → copy the value of ${name}.`,
      password: true,
      ignoreFocusOut: true,
    });

  const session = (await ask("LEETCODE_SESSION"))?.trim();
  if (!session) {
    return undefined;
  }
  const csrf = (await ask("csrftoken"))?.trim();
  if (!csrf) {
    return undefined;
  }

  const auth = { session, csrf };
  const username = await whoAmI(auth);
  if (!username) {
    throw new Error("Those cookies are not a signed-in LeetCode session. Copy them again and retry.");
  }
  await context.secrets.store(SESSION_KEY, session);
  await context.secrets.store(CSRF_KEY, csrf);
  setSignedIn(true);
  vscode.window.showInformationMessage(`LeetCode: signed in as ${username}.`);
  return auth;
}

async function signOut() {
  await context.secrets.delete(SESSION_KEY);
  await context.secrets.delete(CSRF_KEY);
  setSignedIn(false);
  vscode.window.showInformationMessage("LeetCode: signed out. The saved cookies were deleted.");
}

// ---------------------------------------------------------------------------
// New problem
// ---------------------------------------------------------------------------

async function newProblem() {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    throw new Error("Open your LeetCode folder first.");
  }

  const problem = await pickProblem();
  if (!problem) {
    return;
  }

  const details = await fetchDetails(problem.slug, await getAuth());
  const folder = vscode.Uri.joinPath(root, folderName(problem));
  await vscode.workspace.fs.createDirectory(folder);

  const readme = vscode.Uri.joinPath(folder, README);
  await writeIfMissing(readme, () => loadTemplate(root).then((t) => renderReadme(problem, details.statement, t)));
  if (details.testcases.length) {
    await writeIfMissing(vscode.Uri.joinPath(folder, TESTCASES), async () => details.testcases.join("\n") + "\n");
  }
  problems.refresh();
  await vscode.window.showTextDocument(readme, { preview: false });

  const snippet = await pickLanguage(details.snippets, "Language for the solution file (Esc to skip)");
  if (snippet) {
    const solution = vscode.Uri.joinPath(folder, `solution.${extensionFor(snippet.langSlug)}`);
    await writeIfMissing(solution, async () => snippet.code + "\n");
    problems.refresh();
    await vscode.window.showTextDocument(solution, { preview: false, viewColumn: vscode.ViewColumn.Beside });
  }
}

/** Shows a picker that searches LeetCode as the user types. */
function pickProblem(): Promise<Problem | undefined> {
  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick<ProblemItem>();
    picker.placeholder = "Problem number, title or URL";
    picker.matchOnDescription = true;

    let timer: NodeJS.Timeout | undefined;
    let latest = 0;

    picker.onDidChangeValue((value) => {
      clearTimeout(timer);
      const request = ++latest;
      timer = setTimeout(async () => {
        picker.busy = true;
        try {
          const problems = await searchProblems(value);
          if (request !== latest) {
            return; // A newer search has started; drop this result.
          }
          picker.items = problems.map((problem) => ({
            label: `${problem.number}. ${problem.title}`,
            description: problem.difficulty,
            detail: problem.topics.join(", "),
            alwaysShow: true, // LeetCode already filtered; don't filter again locally.
            problem,
          }));
        } catch (error) {
          if (request === latest) {
            picker.items = [];
            vscode.window.showErrorMessage(`LeetCode search failed: ${(error as Error).message}`);
          }
        } finally {
          if (request === latest) {
            picker.busy = false;
          }
        }
      }, 250);
    });

    picker.onDidAccept(() => {
      const choice = picker.selectedItems[0];
      if (choice) {
        resolve(choice.problem);
        picker.hide();
      }
    });
    picker.onDidHide(() => {
      clearTimeout(timer);
      resolve(undefined);
      picker.dispose();
    });
    picker.show();
  });
}

/** Lets the user choose one of the languages LeetCode offers, with the last-used one first. */
async function pickLanguage(snippets: Snippet[], placeHolder: string): Promise<Snippet | undefined> {
  if (!snippets.length) {
    return undefined;
  }
  const last = context.globalState.get<string>(LAST_LANGUAGE_KEY);
  const items: SnippetItem[] = snippets
    .map((snippet) => ({ label: snippet.lang, description: snippet.langSlug, snippet }))
    .sort((a, b) => Number(b.snippet.langSlug === last) - Number(a.snippet.langSlug === last));
  const choice = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true });
  if (choice) {
    await context.globalState.update(LAST_LANGUAGE_KEY, choice.snippet.langSlug);
  }
  return choice?.snippet;
}

/** Reads the custom template from the workspace, falling back to the built-in one. */
async function loadTemplate(root: vscode.Uri): Promise<string> {
  const file = vscode.workspace.getConfiguration("leetcodeNotes").get<string>("templateFile");
  if (file) {
    try {
      return await readText(vscode.Uri.joinPath(root, file));
    } catch {
      // No custom template; use the default.
    }
  }
  return DEFAULT_TEMPLATE;
}

// ---------------------------------------------------------------------------
// Run tests and submit
// ---------------------------------------------------------------------------

interface Solution {
  slug: string;
  folder: vscode.Uri;
  code: string;
  extension: string;
}

/**
 * Reads the solution to send: the file clicked in the side panel or editor toolbar, or else the
 * one in the active editor. Its folder name tells us which problem it is for.
 */
async function targetSolution(target?: unknown): Promise<Solution> {
  const uri =
    target instanceof FileNode
      ? target.uri
      : target instanceof vscode.Uri
        ? target
        : vscode.window.activeTextEditor?.document.uri;
  if (!uri || uri.scheme !== "file") {
    throw new Error("Open the solution file you want to send first.");
  }
  const document = await vscode.workspace.openTextDocument(uri);
  const file = path.basename(document.uri.fsPath);
  const folder = path.dirname(document.uri.fsPath);
  const slug = PROBLEM_FOLDER.exec(path.basename(folder))?.[2];
  if (!slug || file === README || file === TESTCASES) {
    throw new Error('Open a solution file inside a problem folder such as "1-two-sum".');
  }
  if (document.isDirty) {
    await document.save();
  }
  return {
    slug,
    folder: vscode.Uri.file(folder),
    code: document.getText(),
    extension: path.extname(file).slice(1).toLowerCase(),
  };
}

/**
 * Works out which LeetCode language a file is written in from its extension.
 * Some extensions are shared (.py is Python 2, Python 3 and Pandas), so the user is asked then.
 */
async function languageFor(solution: Solution, snippets: Snippet[]): Promise<string | undefined> {
  if (!snippets.length) {
    throw new Error("LeetCode lists no languages for this problem.");
  }
  const matching = snippets.filter((snippet) => extensionFor(snippet.langSlug) === solution.extension);
  if (matching.length === 1) {
    return matching[0].langSlug;
  }
  const question = matching.length
    ? `Which language is this .${solution.extension} file?`
    : `LeetCode has no language for .${solution.extension} files here. Send it as which language?`;
  return (await pickLanguage(matching.length ? matching : snippets, question))?.langSlug;
}

async function runTestsCommand(target?: unknown) {
  const solution = await targetSolution(target);
  const auth = await requireAuth();
  if (!auth) {
    return;
  }
  const details = await fetchDetails(solution.slug, auth);
  const lang = await languageFor(solution, details.snippets);
  if (!lang) {
    return;
  }

  // testcases.txt can be edited to add cases; fall back to LeetCode's examples if it is missing.
  let input: string;
  try {
    input = await readText(vscode.Uri.joinPath(solution.folder, TESTCASES));
  } catch {
    input = details.testcases.join("\n");
  }
  input = input.replace(/\r/g, "").trim();
  if (!input) {
    throw new Error(`${TESTCASES} is empty, so there is nothing to run.`);
  }

  const result = await withProgress("Running tests on LeetCode…", () =>
    runTests(solution.slug, details.questionId, lang, solution.code, input, auth)
  );
  report(`Run · ${solution.slug} · ${lang}`, formatRun(result, input), result);
}

async function submitCommand(target?: unknown) {
  const solution = await targetSolution(target);
  const auth = await requireAuth();
  if (!auth) {
    return;
  }
  const details = await fetchDetails(solution.slug, auth);
  const lang = await languageFor(solution, details.snippets);
  if (!lang) {
    return;
  }
  const result = await withProgress("Submitting to LeetCode…", () =>
    submit(solution.slug, details.questionId, lang, solution.code, auth)
  );
  report(`Submission · ${solution.slug} · ${lang}`, formatSubmission(result), result);
}

/** Writes the full result to the LeetCode output panel and shows the verdict as a notification. */
function report(title: string, body: string, result: any) {
  output.appendLine(`──── ${title} · ${new Date().toLocaleTimeString()} ────`);
  output.appendLine(body);
  output.appendLine("");
  output.show(true);

  const summary = `LeetCode: ${verdict(result)}`;
  if (summary.endsWith("Accepted")) {
    vscode.window.showInformationMessage(summary);
  } else {
    vscode.window.showWarningMessage(summary);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withProgress<T>(title: string, task: () => Promise<T>): Thenable<T> {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task);
}

async function readText(uri: vscode.Uri): Promise<string> {
  return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
}

/** Creates a file only if it does not exist, so existing work is never overwritten. */
async function writeIfMissing(uri: vscode.Uri, content: () => Promise<string>) {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(await content()));
  }
}
