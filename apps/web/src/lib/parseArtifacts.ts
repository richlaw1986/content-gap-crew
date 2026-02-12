/**
 * Detects and splits a single output string into distinct file artifacts.
 *
 * Recognises patterns like:
 *   <!-- index.html -->        (HTML comment with filename)
 *   /* styles.css *​/           (CSS/JS comment with filename)
 *   // app.ts                  (single-line comment with filename)
 *   ```html:index.html         (markdown fence with filename)
 *   **index.html**             (bold filename, common LLM pattern)
 *   ### index.html             (heading with filename)
 *
 * Falls back to a single "Output" artifact if no files are detected.
 */

export interface Artifact {
  /** e.g. "index.html", "styles.css" */
  filename: string;
  /** Detected language for syntax highlighting */
  language: string;
  /** The raw content of the file */
  content: string;
}

const EXT_TO_LANG: Record<string, string> = {
  html: 'html',
  htm: 'html',
  css: 'css',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  py: 'python',
  sh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  sql: 'sql',
  txt: 'text',
};

function langFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANG[ext] || 'text';
}

// Filename regex: word chars, hyphens, dots — must end with a known extension
const FILENAME_RE = /[\w][\w\-.]*\.\w{1,10}/;

// Patterns that introduce a new file block
const FILE_MARKERS = [
  // <!-- filename.ext -->
  /^<!--\s*([\w][\w\-.]*\.\w{1,10})\s*-->/,
  // /* filename.ext */
  /^\/\*\s*([\w][\w\-.]*\.\w{1,10})\s*\*\//,
  // // filename.ext
  /^\/\/\s*([\w][\w\-.]*\.\w{1,10})\s*$/,
  // ```lang:filename.ext  or  ```filename.ext
  /^```\w*:?\s*([\w][\w\-.]*\.\w{1,10})/,
  // **filename.ext**
  /^\*\*\s*([\w][\w\-.]*\.\w{1,10})\s*\*\*/,
  // ### filename.ext  (heading)
  /^#{1,4}\s+([\w][\w\-.]*\.\w{1,10})\s*$/,
];

export function parseArtifacts(output: string): Artifact[] {
  if (!output || !output.trim()) return [];

  const lines = output.split('\n');
  const artifacts: Artifact[] = [];
  let currentFilename: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentFilename && currentLines.length > 0) {
      const content = currentLines.join('\n').trim();
      if (content) {
        artifacts.push({
          filename: currentFilename,
          language: langFromFilename(currentFilename),
          content,
        });
      }
    }
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Check each marker pattern
    let matched = false;
    for (const re of FILE_MARKERS) {
      const m = trimmed.match(re);
      if (m && m[1]) {
        flush();
        currentFilename = m[1];
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // If we're capturing content for a file, add the line
    if (currentFilename) {
      // Strip markdown code fence markers
      if (/^```\w*$/.test(trimmed)) continue;
      currentLines.push(line);
    } else {
      // Haven't found a file marker yet — accumulate as preamble
      currentLines.push(line);
    }
  }

  // Flush last file
  flush();

  // If we found files but had preamble before the first file, ignore it (usually intro text)
  // If we found no files at all, return as a single output
  if (artifacts.length === 0) {
    const content = output.trim();
    if (!content) return [];
    return [{ filename: 'Output', language: 'text', content }];
  }

  return artifacts;
}

/** Check if an output string contains multiple distinct files */
export function hasMultipleFiles(output: string): boolean {
  return parseArtifacts(output).length > 1;
}
