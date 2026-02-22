//! Converts standard Markdown to Telegram MarkdownV2 format.
//! Direct port of src/markdown.ts.
//!
//! Supported conversions:
//!   **bold** / *bold*  →  *bold*
//!   _italic_           →  _italic_
//!   __underline__      →  __underline__
//!   `inline code`      →  `inline code`  (verbatim)
//!   ```lang\ncode\n``` →  ```lang\ncode``` (verbatim)
//!   [text](url)        →  [text](url)
//!   # Heading          →  *Heading*
//!   plain text         →  escaped for MarkdownV2

const V2_SPECIAL: &[char] = &['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!', '\\'];

/// Escapes all MarkdownV2 special characters in a plain-text string.
pub fn escape_v2(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        if V2_SPECIAL.contains(&ch) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

/// Escapes HTML special characters.
pub fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
}

/// Resolves Markdown auto-convert: if parse_mode is "Markdown", converts to MarkdownV2.
pub fn resolve_parse_mode(text: &str, parse_mode: Option<&str>) -> (String, Option<String>) {
    match parse_mode {
        Some("Markdown") => (markdown_to_v2(text), Some("MarkdownV2".to_owned())),
        Some(pm) => (text.to_owned(), Some(pm.to_owned())),
        None => (text.to_owned(), None),
    }
}

/// Converts standard Markdown to Telegram MarkdownV2.
pub fn markdown_to_v2(input: &str) -> String {
    // Normalize escaped \n sequences
    let input_norm = input.replace("\\n", "\n");

    // ── 1. Extract fenced code blocks ─────────────────────────────────────
    let mut code_blocks: Vec<String> = Vec::new();
    let text = extract_code_blocks(&input_norm, &mut code_blocks);

    // ── 1b. Extract blockquotes ───────────────────────────────────────────
    let mut blockquotes: Vec<String> = Vec::new();
    let text = extract_blockquotes(&text, &mut blockquotes);

    // ── 2. ATX headings → bold ────────────────────────────────────────────
    let text = convert_headings(&text);

    // ── 3. Inline tokeniser ───────────────────────────────────────────────
    let text = tokenise_inline(&text, &code_blocks, &blockquotes);

    text
}

fn extract_code_blocks(input: &str, code_blocks: &mut Vec<String>) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        // Look for ``` at start
        if bytes.get(i..i+3) == Some(b"```") {
            // Find the language line end
            let lang_start = i + 3;
            let lang_end = input[lang_start..].find('\n').map(|p| lang_start + p).unwrap_or(input.len());
            let lang = &input[lang_start..lang_end];
            let body_start = lang_end + 1;

            // Find closing ```
            if let Some(close_rel) = input[body_start..].find("```") {
                let close_abs = body_start + close_rel;
                let body = &input[body_start..close_abs];
                let idx = code_blocks.len();
                code_blocks.push(format!("```{lang}\n{body}```"));
                out.push_str(&format!("\x00CB{idx}\x00"));
                i = close_abs + 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn extract_blockquotes(input: &str, blockquotes: &mut Vec<String>) -> String {
    let mut out = String::new();
    for line in input.lines() {
        if let Some(stripped) = line.strip_prefix("> ").or_else(|| line.strip_prefix('>')) {
            let idx = blockquotes.len();
            blockquotes.push(format!(">{}", escape_v2(stripped)));
            out.push_str(&format!("\x00BQ{idx}\x00"));
        } else {
            out.push_str(line);
        }
        out.push('\n');
    }
    // Remove trailing newline added above if input didn't end with one
    if !input.ends_with('\n') && out.ends_with('\n') {
        out.pop();
    }
    out
}

fn convert_headings(input: &str) -> String {
    let mut out = String::new();
    for line in input.lines() {
        let trimmed = line.trim_start_matches('#');
        if trimmed.len() < line.len() && trimmed.starts_with(' ') {
            let content = trimmed.trim_start();
            out.push_str(&format!("*{}*", escape_v2(content)));
        } else {
            out.push_str(line);
        }
        out.push('\n');
    }
    if !input.ends_with('\n') && out.ends_with('\n') {
        out.pop();
    }
    out
}

fn tokenise_inline(text: &str, code_blocks: &[String], blockquotes: &[String]) -> String {
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut out = String::new();
    let mut i = 0;

    while i < len {
        // Placeholder tokens \x00{CB|BQ}N\x00
        if chars[i] == '\x00' {
            if let Some(end) = chars[i+1..].iter().position(|&c| c == '\x00') {
                let tag_and_idx: String = chars[i+1..i+1+end].iter().collect();
                if let Some(rest) = tag_and_idx.strip_prefix("CB") {
                    if let Ok(idx) = rest.parse::<usize>() {
                        out.push_str(&code_blocks[idx]);
                        i += 2 + end;
                        continue;
                    }
                } else if let Some(rest) = tag_and_idx.strip_prefix("BQ") {
                    if let Ok(idx) = rest.parse::<usize>() {
                        out.push_str(&blockquotes[idx]);
                        i += 2 + end;
                        continue;
                    }
                }
            }
        }

        // Inline code `...`
        if chars[i] == '`' {
            if let Some(end) = chars[i+1..].iter().position(|&c| c == '`') {
                let end_abs = i + 1 + end;
                let inner: String = chars[i+1..end_abs].iter().collect();
                // Inside code spans, only \ and ` need escaping
                let inner_escaped = inner.replace('\\', "\\\\").replace('`', "\\`");
                out.push('`');
                out.push_str(&inner_escaped);
                out.push('`');
                i = end_abs + 1;
                continue;
            }
        }

        // Strikethrough ~~text~~
        if chars[i] == '~' && chars.get(i+1) == Some(&'~') {
            if let Some(end_rel) = find_closing(&chars[i+2..], "~~") {
                let end_abs = i + 2 + end_rel;
                let inner: String = chars[i+2..end_abs].iter()
                    .collect::<String>();
                let inner_processed = tokenise_inline(&inner, code_blocks, blockquotes);
                out.push_str(&format!("~{inner_processed}~"));
                i = end_abs + 2;
                continue;
            }
        }

        // Bold **text** or *text*
        if chars[i] == '*' {
            let double = chars.get(i+1) == Some(&'*');
            if double {
                if let Some(end_rel) = find_closing(&chars[i+2..], "**") {
                    let end_abs = i + 2 + end_rel;
                    let inner: String = chars[i+2..end_abs].iter().collect();
                    let inner_escaped = escape_v2_inline(&inner, code_blocks, blockquotes);
                    out.push_str(&format!("*{inner_escaped}*"));
                    i = end_abs + 2;
                    continue;
                }
            } else {
                if let Some(end_rel) = find_closing_single(&chars[i+1..], '*') {
                    let end_abs = i + 1 + end_rel;
                    let inner: String = chars[i+1..end_abs].iter().collect();
                    let inner_escaped = escape_v2_inline(&inner, code_blocks, blockquotes);
                    out.push_str(&format!("*{inner_escaped}*"));
                    i = end_abs + 1;
                    continue;
                }
            }
        }

        // Underline __text__ or italic _text_
        if chars[i] == '_' {
            let double = chars.get(i+1) == Some(&'_');
            if double {
                if let Some(end_rel) = find_closing(&chars[i+2..], "__") {
                    let end_abs = i + 2 + end_rel;
                    let inner: String = chars[i+2..end_abs].iter().collect();
                    let inner_escaped = escape_v2_inline(&inner, code_blocks, blockquotes);
                    out.push_str(&format!("__{inner_escaped}__"));
                    i = end_abs + 2;
                    continue;
                }
            } else {
                if let Some(end_rel) = find_closing_single(&chars[i+1..], '_') {
                    let end_abs = i + 1 + end_rel;
                    let inner: String = chars[i+1..end_abs].iter().collect();
                    let inner_escaped = escape_v2_inline(&inner, code_blocks, blockquotes);
                    out.push_str(&format!("_{inner_escaped}_"));
                    i = end_abs + 1;
                    continue;
                }
            }
        }

        // Link [text](url)
        if chars[i] == '[' {
            if let Some((text_end, url_start, url_end)) = find_link(&chars[i..]) {
                let link_text: String = chars[i+1..i+text_end].iter().collect();
                let url: String = chars[i+url_start..i+url_end].iter().collect();
                let link_text_escaped = escape_v2(&link_text);
                // Escape only parens in URL, not dots
                let url_escaped = url.replace(')', "\\)");
                out.push_str(&format!("[{link_text_escaped}]({url_escaped})"));
                i += url_end + 1; // skip closing ')'
                continue;
            }
        }

        // Plain char — escape it
        let ch = chars[i];
        if V2_SPECIAL.contains(&ch) {
            out.push('\\');
        }
        out.push(ch);
        i += 1;
    }

    out
}

/// Escape a string for inline use inside bold/italic (same rules but inside formatting markers).
fn escape_v2_inline(s: &str, code_blocks: &[String], blockquotes: &[String]) -> String {
    tokenise_inline(s, code_blocks, blockquotes)
}

fn find_closing(chars: &[char], closing: &str) -> Option<usize> {
    let closing_chars: Vec<char> = closing.chars().collect();
    let clen = closing_chars.len();
    chars.windows(clen).position(|w| w == closing_chars.as_slice())
}

fn find_closing_single(chars: &[char], ch: char) -> Option<usize> {
    chars.iter().position(|&c| c == ch)
}

fn find_link(chars: &[char]) -> Option<(usize, usize, usize)> {
    // chars[0] is '[', look for ']('...url...')'
    if chars.is_empty() || chars[0] != '[' { return None; }
    let text_end = chars[1..].iter().position(|&c| c == ']')? + 1;
    if chars.get(text_end + 1) != Some(&'(') { return None; }
    let url_start = text_end + 2;
    let url_end = chars[url_start..].iter().position(|&c| c == ')')? + url_start;
    Some((text_end, url_start, url_end))
}

// ---------------------------------------------------------------------------
// Strip formatting for TTS (plain text)
// ---------------------------------------------------------------------------

/// Strips all Markdown formatting, leaving plain text for TTS synthesis.
pub fn strip_for_tts(text: &str) -> String {
    let text = text.replace("**", "").replace("__", "");
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;
    while i < len {
        match chars[i] {
            '*' | '_' | '~' if chars.get(i+1) == Some(&chars[i]) => {
                // Skip double marker
                i += 2;
                continue;
            }
            '*' | '_' | '~' => {
                // Skip single marker
                i += 1;
                continue;
            }
            '`' => {
                // Include code span content
                if let Some(end) = chars[i+1..].iter().position(|&c| c == '`') {
                    let content: String = chars[i+1..i+1+end].iter().collect();
                    out.push_str(&content);
                    i += 2 + end;
                } else {
                    i += 1;
                }
                continue;
            }
            '[' => {
                // [text](url) → just the text
                if let Some((text_end, _, url_end)) = find_link(&chars[i..]) {
                    let link_text: String = chars[i+1..i+text_end].iter().collect();
                    out.push_str(&link_text);
                    i += url_end + 1;
                    continue;
                }
                out.push(chars[i]);
                i += 1;
            }
            '#' if i == 0 || chars.get(i-1) == Some(&'\n') => {
                // Skip # heading markers
                while i < len && chars[i] == '#' { i += 1; }
                while i < len && chars[i] == ' ' { i += 1; }
                continue;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    out.trim().to_owned()
}

// ---------------------------------------------------------------------------
// Tests (mirrors src/markdown.test.ts exactly)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_plain_text_special_chars() {
        assert_eq!(markdown_to_v2("Hello. World!"), "Hello\\. World\\!");
    }

    #[test]
    fn converts_double_asterisk_bold() {
        assert_eq!(markdown_to_v2("**hello**"), "*hello*");
    }

    #[test]
    fn converts_italic_underscore() {
        assert_eq!(markdown_to_v2("_hi_"), "_hi_");
    }

    #[test]
    fn converts_double_underscore_underline() {
        assert_eq!(markdown_to_v2("__under__"), "__under__");
    }

    #[test]
    fn converts_single_asterisk_bold() {
        assert_eq!(markdown_to_v2("*hi*"), "*hi*");
    }

    #[test]
    fn preserves_inline_code_escaping_backslashes() {
        assert_eq!(markdown_to_v2("`foo.bar()`"), "`foo.bar()`");
        assert_eq!(markdown_to_v2("`back\\slash`"), "`back\\\\slash`");
    }

    #[test]
    fn preserves_fenced_code_blocks_verbatim() {
        let input = "```js\nconsole.log('hi!');\n```";
        assert_eq!(markdown_to_v2(input), input);
    }

    #[test]
    fn converts_link_dots_in_url_not_escaped() {
        assert_eq!(
            markdown_to_v2("[click](https://example.com)"),
            "[click](https://example.com)"
        );
    }

    #[test]
    fn converts_heading_to_bold() {
        assert_eq!(markdown_to_v2("# Title"), "*Title*");
    }

    #[test]
    fn escapes_plain_text_inside_bold() {
        assert_eq!(markdown_to_v2("**foo.bar**"), "*foo\\.bar*");
    }

    #[test]
    fn handles_mixed_content() {
        let out = markdown_to_v2("Done. **v1.2** saved to `out.json`!");
        assert_eq!(out, "Done\\. *v1\\.2* saved to `out.json`\\!");
    }

    #[test]
    fn escapes_plain_pipes_dashes() {
        let out = markdown_to_v2("a - b | c");
        assert_eq!(out, "a \\- b \\| c");
    }
}
