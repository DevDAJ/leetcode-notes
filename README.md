# LeetCode Notes

A VS Code / VSCodium extension for keeping a LeetCode solutions repo. For each problem it creates a folder with a write-up README, starter code in the language you choose, and the example test cases. You can then run and submit your solution without leaving the editor.

```
1-two-sum/
  README.md        problem statement + your write-up
  solution.py      LeetCode's starter code, in any language it offers
  testcases.txt    the example inputs
```

> This is an unofficial tool. It is not affiliated with or endorsed by LeetCode.

## Features

- **New Problem** — search LeetCode by number, title or URL and create the problem folder.
- **Any language** — the language list comes from LeetCode for each problem, so every language LeetCode accepts works, and one problem can hold solutions in several languages.
- **Run Tests** — run your solution against `testcases.txt` on LeetCode's servers.
- **Submit** — submit your solution and see the verdict, runtime and memory.
- **Side panel** — a LeetCode view in the activity bar lists your problems, with buttons for everything above.

## Installation

The extension is not on the Marketplace or Open VSX. Install it from a `.vsix` file.

### Option 1: download a release

1. Download `leetcode-notes-<version>.vsix` from the [latest release](https://github.com/DevDAJ/leetcode-notes/releases/latest).
2. Install it from a terminal:

   ```bash
   # VS Code
   code --install-extension leetcode-notes-<version>.vsix

   # VSCodium
   codium --install-extension leetcode-notes-<version>.vsix
   ```

   Or, inside the editor: open the Command Palette, run **Extensions: Install from VSIX…**, and choose the file.
3. Reload the window (**Developer: Reload Window**).

### Option 2: build from source

Requires Node.js 20 or newer.

```bash
git clone https://github.com/DevDAJ/leetcode-notes.git
cd leetcode-notes
npm install
npm run package
code --install-extension leetcode-notes-*.vsix   # or: codium --install-extension …
```

### If you use editor profiles

Extensions are installed per profile. The commands above install into the Default profile. To install into another one, name it:

```bash
code --profile "My Profile" --install-extension leetcode-notes-<version>.vsix
```

### Updating and uninstalling

To update, install the newer `.vsix` the same way; it replaces the old version. To uninstall:

```bash
code --uninstall-extension DevDAJ.leetcode-notes
```

## Usage

1. Open the folder you keep your solutions in.
2. Click the **LeetCode** icon in the activity bar, then **+** (or run **LeetCode: New Problem** from the Command Palette).
3. Type a problem number, title or URL and pick the problem.
4. Pick a language. Press Esc to skip creating a solution file.
5. Write your solution, then use the **Run Tests** and **Submit** buttons at the top right of the editor, or next to the file in the side panel.

Results appear in the **LeetCode** output panel.

Existing files are never overwritten. Running **New Problem** again for the same problem lets you add a solution in another language.

### Commands

| Command | What it does |
| --- | --- |
| LeetCode: New Problem | Creates the problem folder, README, test cases and solution file |
| LeetCode: Run Tests | Runs the open solution against `testcases.txt` |
| LeetCode: Submit | Submits the open solution |
| LeetCode: Sign In | Saves your LeetCode session cookies |
| LeetCode: Sign Out | Deletes the saved cookies |
| LeetCode: Refresh Problems | Reloads the side panel |

### Signing in

Creating problems needs no account. **Run Tests** and **Submit** do, and LeetCode has no official sign-in for tools, so the extension uses your browser session:

1. Sign in to [leetcode.com](https://leetcode.com) in your browser.
2. Open the browser's developer tools → **Application** (Chrome) or **Storage** (Firefox) → **Cookies** → `https://leetcode.com`.
3. Run **LeetCode: Sign In** and paste the values of `LEETCODE_SESSION` and `csrftoken` when asked.

The cookies are kept in the editor's encrypted secret storage, never in your workspace. They expire after a few weeks; sign in again when LeetCode starts rejecting requests. Treat them like a password.

### Test cases

`testcases.txt` uses the same format as LeetCode's test-case box: one line per argument, cases one after another. Add your own cases at the end.

```
[2,7,11,15]
9
[3,2,4]
6
```

### Custom README template

Create `.leetcode-template.md` in the root of your solutions folder to replace the built-in write-up template. These placeholders are filled in:

| Placeholder | Value |
| --- | --- |
| `{number}` | Problem number |
| `{title}` | Problem title |
| `{url}` | Link to the problem |
| `{difficulty}` | Easy, Medium or Hard |
| `{topics}` | Topic tags |
| `{statement}` | The problem statement as Markdown |

The file name can be changed with the `leetcodeNotes.templateFile` setting.

## Things to know

- **Unofficial API.** The extension talks to the same endpoints as the LeetCode website. They are undocumented, can change without notice, and LeetCode may block requests that do not come from a browser.
- **Submissions are real.** **Submit** creates a submission on your account.
- **Problem statements belong to LeetCode.** The generated README contains the statement. Keep that in mind before making a solutions repo public; a custom template without `{statement}` leaves it out.
- **Premium problems** only include their statement when you are signed in with a premium account.

## Development

```bash
npm install
npm run watch    # recompile on change
```

Press F5 in VS Code to launch an Extension Development Host. The source is in `src/`:

| File | Purpose |
| --- | --- |
| `extension.ts` | Commands, pickers and sign-in |
| `sidebar.ts` | The side panel |
| `leetcode.ts` | LeetCode requests and README rendering |
| `markdown.ts` | Converts problem statements from HTML to Markdown |
| `results.ts` | Formats run and submission results |
| `languages.ts` | File extensions for LeetCode's languages |

## License

[MIT](LICENSE)
