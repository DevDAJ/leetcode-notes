// The LeetCode side panel: a tree of the problem folders in the workspace and the files inside them.

import * as vscode from "vscode";

export const README = "README.md";
export const TESTCASES = "testcases.txt";

/** Problem folders are named "<number>-<slug>", for example "1-two-sum". */
export const PROBLEM_FOLDER = /^(\d+)-(.+)$/;

export class ProblemNode {
  constructor(
    readonly uri: vscode.Uri,
    readonly number: number,
    readonly slug: string,
    readonly title: string,
    readonly difficulty: string | undefined
  ) {}
}

export class FileNode {
  constructor(readonly uri: vscode.Uri, readonly name: string) {}

  /** Anything that is not the write-up or the test cases is treated as a solution. */
  get isSolution(): boolean {
    return this.name !== README && this.name !== TESTCASES;
  }
}

type Node = ProblemNode | FileNode;

export class ProblemsProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  refresh() {
    this.changed.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node instanceof ProblemNode) {
      const item = new vscode.TreeItem(`${node.number}. ${node.title}`, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = node.difficulty;
      item.contextValue = "problem";
      item.tooltip = `https://leetcode.com/problems/${node.slug}/`;
      return item;
    }
    const item = new vscode.TreeItem(node.uri, vscode.TreeItemCollapsibleState.None);
    item.contextValue = node.isSolution ? "solution" : "file";
    item.command = { command: "vscode.open", title: "Open", arguments: [node.uri] };
    return item;
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node instanceof FileNode) {
      return [];
    }
    if (node instanceof ProblemNode) {
      return this.files(node.uri);
    }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    return root ? this.problems(root) : [];
  }

  private async problems(root: vscode.Uri): Promise<ProblemNode[]> {
    const entries = await vscode.workspace.fs.readDirectory(root);
    const nodes = await Promise.all(
      entries.map(async ([name, type]) => {
        const match = PROBLEM_FOLDER.exec(name);
        if (!match || !(type & vscode.FileType.Directory)) {
          return undefined;
        }
        const uri = vscode.Uri.joinPath(root, name);
        const { title, difficulty } = await readHeader(uri);
        return new ProblemNode(uri, Number(match[1]), match[2], title ?? match[2], difficulty);
      })
    );
    return nodes.filter((n): n is ProblemNode => n !== undefined).sort((a, b) => a.number - b.number);
  }

  private async files(folder: vscode.Uri): Promise<FileNode[]> {
    const entries = await vscode.workspace.fs.readDirectory(folder);
    // Write-up first, then solutions, then test cases.
    const rank = (name: string) => (name === README ? 0 : name === TESTCASES ? 2 : 1);
    return entries
      .filter(([name, type]) => type & vscode.FileType.File && !name.startsWith("."))
      .map(([name]) => new FileNode(vscode.Uri.joinPath(folder, name), name))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  }
}

/** Reads the problem title and difficulty from the top of the write-up, if it follows the default layout. */
async function readHeader(folder: vscode.Uri): Promise<{ title?: string; difficulty?: string }> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, README));
    const head = Buffer.from(bytes.slice(0, 600)).toString("utf8");
    return {
      title: /^#\s+\d+\.\s+(.+)$/m.exec(head)?.[1].trim(),
      difficulty: /\*\*Difficulty:\*\*\s*(\w+)/.exec(head)?.[1],
    };
  } catch {
    return {};
  }
}
