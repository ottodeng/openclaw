export type ManagedMarkdownBlockParams = {
  original: string;
  body: string;
  startMarker: string;
  endMarker: string;
  heading?: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function withTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

export function replaceManagedMarkdownBlock(params: ManagedMarkdownBlockParams): string {
  const headingPrefix = params.heading ? `${params.heading}\n` : "";
  const managedBlock = `${headingPrefix}${params.startMarker}\n${params.body}\n${params.endMarker}`;

  // Match against any line-ending style: \n, \r\n, or \r. A whitespace mismatch
  // between the on-disk file and the template should not cause the matcher to
  // miss the existing block (which previously caused the block to be appended
  // again, accumulating duplicates over time).
  const headingMatcher = params.heading
    ? `${escapeRegex(params.heading)}[\\r\\n]+`
    : "";
  const existingPattern = new RegExp(
    `${headingMatcher}${escapeRegex(params.startMarker)}[\\s\\S]*?${escapeRegex(params.endMarker)}`,
    "gm",
  );

  if (existingPattern.test(params.original)) {
    // Reset lastIndex after .test() before reusing the regex with .replace().
    existingPattern.lastIndex = 0;
    // The `g` flag replaces all occurrences. If the file already contains
    // duplicate managed blocks (from prior runs with the non-global regex),
    // every duplicate is rewritten to the same fresh block. The resulting
    // identical adjacent blocks are then collapsed to a single block so the
    // file self-heals back to one canonical block per marker.
    let next = params.original.replace(existingPattern, managedBlock);
    const escapedBlock = escapeRegex(managedBlock);
    const adjacentDuplicates = new RegExp(
      `(${escapedBlock})(?:[\\r\\n]*${escapedBlock})+`,
      "g",
    );
    next = next.replace(adjacentDuplicates, "$1");
    return next;
  }

  const trimmed = params.original.trimEnd();
  if (trimmed.length === 0) {
    return `${managedBlock}\n`;
  }
  return `${trimmed}\n\n${managedBlock}\n`;
}
