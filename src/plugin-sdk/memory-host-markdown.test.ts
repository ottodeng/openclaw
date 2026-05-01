import { describe, expect, it } from "vitest";
import { replaceManagedMarkdownBlock, withTrailingNewline } from "./memory-host-markdown.js";

describe("withTrailingNewline", () => {
  it("preserves trailing newlines", () => {
    expect(withTrailingNewline("hello\n")).toBe("hello\n");
  });

  it("adds a trailing newline when missing", () => {
    expect(withTrailingNewline("hello")).toBe("hello\n");
  });
});

describe("replaceManagedMarkdownBlock", () => {
  it("appends a managed block when missing", () => {
    expect(
      replaceManagedMarkdownBlock({
        original: "# Title\n",
        heading: "## Generated",
        startMarker: "<!-- start -->",
        endMarker: "<!-- end -->",
        body: "- first",
      }),
    ).toBe("# Title\n\n## Generated\n<!-- start -->\n- first\n<!-- end -->\n");
  });

  it("replaces an existing managed block in place", () => {
    expect(
      replaceManagedMarkdownBlock({
        original:
          "# Title\n\n## Generated\n<!-- start -->\n- old\n<!-- end -->\n\n## Notes\nkept\n",
        heading: "## Generated",
        startMarker: "<!-- start -->",
        endMarker: "<!-- end -->",
        body: "- new",
      }),
    ).toBe("# Title\n\n## Generated\n<!-- start -->\n- new\n<!-- end -->\n\n## Notes\nkept\n");
  });

  it("supports headingless blocks", () => {
    expect(
      replaceManagedMarkdownBlock({
        original: "alpha\n",
        startMarker: "<!-- start -->",
        endMarker: "<!-- end -->",
        body: "beta",
      }),
    ).toBe("alpha\n\n<!-- start -->\nbeta\n<!-- end -->\n");
  });

  it("matches blocks with CRLF line endings", () => {
    const original =
      "# Title\r\n\r\n## Generated\r\n<!-- start -->\r\n- old\r\n<!-- end -->\r\n";
    expect(
      replaceManagedMarkdownBlock({
        original,
        heading: "## Generated",
        startMarker: "<!-- start -->",
        endMarker: "<!-- end -->",
        body: "- new",
      }),
    ).toBe(
      "# Title\r\n\r\n## Generated\n<!-- start -->\n- new\n<!-- end -->\r\n",
    );
  });

  it("collapses pre-existing duplicate blocks back to one", () => {
    const dup = "## Generated\n<!-- start -->\n- old\n<!-- end -->";
    const original = `# Title\n\n${dup}\n\n${dup}\n\n${dup}\n`;
    const result = replaceManagedMarkdownBlock({
      original,
      heading: "## Generated",
      startMarker: "<!-- start -->",
      endMarker: "<!-- end -->",
      body: "- new",
    });
    const newBlock = "## Generated\n<!-- start -->\n- new\n<!-- end -->";
    // Should contain exactly one copy of the new block.
    const matches = result.split(newBlock).length - 1;
    expect(matches).toBe(1);
    // And no remnants of the old body.
    expect(result).not.toContain("- old");
  });

  it("is idempotent across repeated calls with the same body", () => {
    const params = {
      heading: "## Generated",
      startMarker: "<!-- start -->",
      endMarker: "<!-- end -->",
      body: "- only",
    } as const;
    const first = replaceManagedMarkdownBlock({ original: "# Title\n", ...params });
    const second = replaceManagedMarkdownBlock({ original: first, ...params });
    const third = replaceManagedMarkdownBlock({ original: second, ...params });
    expect(second).toBe(first);
    expect(third).toBe(first);
  });
});
