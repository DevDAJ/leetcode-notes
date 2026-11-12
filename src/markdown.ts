// Converts the HTML of a LeetCode problem statement to Markdown.
// LeetCode's markup is a small, regular subset of HTML, so regular expressions are enough.

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  le: "≤",
  ge: "≥",
  ne: "≠",
  times: "×",
  minus: "−",
  hellip: "…",
  rarr: "→",
  larr: "←",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[\da-f]+|\w+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** Wraps text in a marker such as ** or *, keeping surrounding spaces outside the marker. */
function wrap(marker: string, inner: string): string {
  const text = inner.trim();
  if (!text) {
    return inner;
  }
  const leading = /^\s*/.exec(inner)![0];
  const trailing = /\s*$/.exec(inner)![0];
  return `${leading}${marker}${text}${marker}${trailing}`;
}

export function htmlToMarkdown(html: string): string {
  const blocks: string[] = [];
  const protect = (block: string) => `\u0000${blocks.push(block) - 1}\u0000`;

  // Non-breaking spaces become plain spaces up front, so "<strong>Input:&nbsp;</strong>" trims cleanly.
  let text = html.replace(/\r/g, "").replace(/&nbsp;|\u00a0/g, " ");

  // Superscripts and subscripts first, so 10<sup>4</sup> reads as 10^4 everywhere.
  text = text.replace(/<sup>([\s\S]*?)<\/sup>/gi, "^$1").replace(/<sub>([\s\S]*?)<\/sub>/gi, "_$1");

  // Code blocks and inline code are protected from all later rewriting.
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, body: string) =>
    protect("\n\n```\n" + decodeEntities(stripTags(body)).trim() + "\n```\n\n")
  );
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, body: string) =>
    protect("`" + decodeEntities(stripTags(body)).trim() + "`")
  );

  text = text.replace(/<img[^>]*>/gi, (tag) => {
    const src = /src="([^"]*)"/i.exec(tag)?.[1];
    const alt = /alt="([^"]*)"/i.exec(tag)?.[1] ?? "";
    return src ? `\n\n![${alt}](${src})\n\n` : "";
  });
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, body: string) => {
    const url = href.startsWith("/") ? `https://leetcode.com${href}` : href;
    return `[${stripTags(body).trim()}](${url})`;
  });

  text = text.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, body: string) => wrap("**", body));
  text = text.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, body: string) => wrap("*", body));

  // Numbered lists, then bullets for everything else.
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, body: string) => {
    let index = 0;
    return "\n\n" + body.replace(/<li[^>]*>/gi, () => `\n${++index}. `) + "\n\n";
  });
  text = text.replace(/<li[^>]*>/gi, "\n- ");

  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(p|div|ul|ol|table|tr|h\d)\b[^>]*>/gi, "\n\n");
  text = decodeEntities(stripTags(text));

  // Tidy whitespace: no trailing spaces, no indented lines, at most one blank line.
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    // Keep consecutive list items together instead of separated by blank lines.
    .replace(/^((?:- |\d+\. ).*)\n\n(?=- |\d+\. )/gm, "$1\n")
    .trim();

  return text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => blocks[Number(index)]).replace(/\n{3,}/g, "\n\n");
}
