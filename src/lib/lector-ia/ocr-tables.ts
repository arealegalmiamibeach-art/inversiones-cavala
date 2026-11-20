export function markdownWithInlineTables(page: {
  markdown?: string;
  tables?: Array<{ id?: string; content?: string }>;
}) {
  let markdown = page.markdown ?? "";
  for (const table of page.tables ?? []) {
    const id = table.id?.trim();
    const content = table.content?.trim();
    if (!id || !content) continue;
    // Escape the provider's identifier before using it as a regex target.
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const reference = new RegExp(`!?\\[[^\\]\\n]*\\]\\(<?${escaped}>?\\)|\\[${escaped}\\](?![\\[(])`, "g");
    if (reference.test(markdown)) {
      reference.lastIndex = 0;
      markdown = markdown.replace(reference, () => `\n\n${content}\n\n`);
    } else if (!markdown.includes(content)) {
      markdown += `\n\n${content}`;
    }
  }
  return markdown.replace(/\u0000/g, "").trim();
}
