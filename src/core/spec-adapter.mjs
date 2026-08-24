import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync
} from "node:fs";
import { createHash } from "node:crypto";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";

const SUPPORTED_FORMATS = new Set(["native", "openspec", "spec-kit"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const IGNORED_DIRECTORIES = new Set([".git", ".apex-v2", "node_modules"]);
const DESCRIPTION_HEADINGS = new Set([
  "description",
  "overview",
  "summary",
  "problem",
  "proposal",
  "specification",
  "描述",
  "概述",
  "摘要",
  "背景",
  "方案"
]);
const COMMAND_HEADINGS = new Set([
  "acceptance",
  "acceptance commands",
  "verification",
  "verification commands",
  "validation",
  "validation commands",
  "test commands",
  "验收",
  "验收命令",
  "验证",
  "验证命令",
  "测试命令"
]);
const EVIDENCE_HEADINGS = new Set([
  "evidence",
  "evidence refs",
  "evidence references",
  "references",
  "artifacts",
  "supporting files",
  "证据",
  "证据引用",
  "参考",
  "产物"
]);
const AFFECTED_AREA_HEADINGS = new Set([
  "affected area",
  "affected areas",
  "affected component",
  "affected components",
  "scope",
  "影响范围",
  "影响区域",
  "影响组件"
]);

export function normalizeSpecSource(projectDir, input = {}) {
  const projectRoot = resolveExistingProjectRoot(projectDir);
  const requestedPath = String(input.path || "").trim();
  if (!requestedPath) throw new Error("Spec path 不能为空");

  const requestedFormat = normalizeFormat(input.format || "auto");
  const sourcePath = resolveSourcePath(projectRoot, requestedPath);
  const sourceStat = statSync(sourcePath);
  const kind = sourceStat.isDirectory() ? "directory" : sourceStat.isFile() ? "file" : null;
  if (!kind) throw new Error(`Spec source 不是普通文件或目录：${requestedPath}`);

  const files = kind === "file"
    ? collectSingleMarkdownFile(projectRoot, sourcePath)
    : collectMarkdownDirectory(projectRoot, sourcePath);
  const format = requestedFormat === "auto"
    ? detectFormat(projectRoot, sourcePath, files)
    : requestedFormat;
  assertFormatShape(format, projectRoot, sourcePath, files);

  const documents = files.map((path) => parseDocument(projectRoot, path));
  const primary = selectPrimaryDocument(format, documents);
  const sourceFiles = files.map((path) => projectRelative(projectRoot, path)).sort();
  const acceptanceCommands = unique(documents.flatMap(extractAcceptanceCommands));
  const explicitEvidence = documents.flatMap((document) => extractEvidenceRefs(
    projectRoot,
    document
  ));
  const affectedAreas = unique(documents.flatMap(extractAffectedAreas));

  return {
    source: `spec:${format}`,
    type: "feature",
    title: extractTitle(primary),
    description: extractDescription(primary),
    priority: "P2",
    risk: "medium",
    affected_area: affectedAreas.length > 0 ? affectedAreas.join(", ") : "unknown",
    acceptance_commands: acceptanceCommands,
    evidence_refs: unique([...sourceFiles, ...explicitEvidence]),
    source_spec: {
      schema_version: "v0",
      format,
      path: projectRelative(projectRoot, sourcePath) || ".",
      kind,
      files: sourceFiles,
      checksum: checksumFiles(projectRoot, files)
    }
  };
}

function resolveExistingProjectRoot(projectDir) {
  const path = resolve(String(projectDir || "."));
  if (!existsSync(path)) throw new Error(`项目根目录不存在：${path}`);
  const real = realpathSync(path);
  if (!statSync(real).isDirectory()) throw new Error(`项目根目录不是目录：${path}`);
  return real;
}

function normalizeFormat(value) {
  const normalized = String(value).trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "auto") return normalized;
  if (normalized === "speckit" || normalized === "spec kit") return "spec-kit";
  if (!SUPPORTED_FORMATS.has(normalized)) {
    throw new Error(`不支持的 Spec 格式：${value}`);
  }
  return normalized;
}

function resolveSourcePath(projectRoot, requestedPath) {
  const lexicalPath = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(projectRoot, requestedPath);
  assertInsideProject(projectRoot, lexicalPath);
  if (!existsSync(lexicalPath)) throw new Error(`Spec source 不存在：${requestedPath}`);
  const realPath = realpathSync(lexicalPath);
  assertInsideProject(projectRoot, realPath);
  return realPath;
}

function collectSingleMarkdownFile(projectRoot, path) {
  assertMarkdownFile(path);
  assertInsideProject(projectRoot, realpathSync(path));
  return [realpathSync(path)];
}

function collectMarkdownDirectory(projectRoot, sourcePath) {
  const files = [];
  const visited = new Set();
  walk(sourcePath);
  if (files.length === 0) {
    throw new Error(`Spec 目录没有 Markdown 文件：${projectRelative(projectRoot, sourcePath)}`);
  }
  return [...new Set(files)].sort((left, right) => (
    projectRelative(projectRoot, left).localeCompare(projectRelative(projectRoot, right))
  ));

  function walk(directory) {
    const realDirectory = realpathSync(directory);
    assertInsideProject(projectRoot, realDirectory);
    if (visited.has(realDirectory)) return;
    visited.add(realDirectory);

    for (const entry of readdirSync(realDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const entryPath = join(realDirectory, entry.name);
      const realEntry = realpathSync(entryPath);
      assertInsideProject(projectRoot, realEntry);
      const stats = statSync(realEntry);
      if (stats.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(realEntry);
      } else if (stats.isFile() && MARKDOWN_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(realEntry);
      }
    }
  }
}

function assertMarkdownFile(path) {
  if (!MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase())) {
    throw new Error(`Spec Adapter 只支持 Markdown 文件：${path}`);
  }
}

function assertInsideProject(projectRoot, target) {
  const pathFromRoot = relative(projectRoot, target);
  if (
    pathFromRoot === ".."
    || pathFromRoot.startsWith(`..${sep}`)
    || isAbsolute(pathFromRoot)
  ) {
    throw new Error(`Spec source 位于项目根目录之外：${target}`);
  }
}

function detectFormat(projectRoot, sourcePath, files) {
  const sourceRelative = projectRelative(projectRoot, sourcePath).toLowerCase();
  const relativeFiles = files.map((path) => projectRelative(projectRoot, path).toLowerCase());
  const basenames = new Set(relativeFiles.map((path) => basename(path)));

  if (
    sourceRelative.split("/").some((part) => part === "openspec" || part === ".openspec")
    || relativeFiles.some((path) => path.split("/").some((part) => part === "openspec" || part === ".openspec"))
    || basenames.has("proposal.md")
  ) {
    return "openspec";
  }
  if (
    basenames.has("spec.md")
    && (basenames.has("plan.md") || basenames.has("tasks.md"))
  ) {
    return "spec-kit";
  }
  return "native";
}

function assertFormatShape(format, projectRoot, sourcePath, files) {
  if (format === "native") return;
  const sourceRelative = projectRelative(projectRoot, sourcePath).toLowerCase();
  const relativeFiles = files.map((path) => projectRelative(projectRoot, path).toLowerCase());
  const basenames = new Set(relativeFiles.map((path) => basename(path)));

  if (format === "openspec") {
    const recognized = sourceRelative.split("/").some((part) => (
      part === "openspec" || part === ".openspec"
    )) || ["proposal.md", "design.md", "tasks.md", "spec.md"].some((name) => (
      basenames.has(name)
    ));
    if (!recognized) {
      throw new Error("OpenSpec source 缺少 proposal.md、design.md、tasks.md 或 spec.md");
    }
  }

  if (format === "spec-kit") {
    const recognized = ["spec.md", "plan.md", "tasks.md", "research.md", "quickstart.md"]
      .some((name) => basenames.has(name));
    if (!recognized) {
      throw new Error("Spec Kit source 缺少 spec.md、plan.md、tasks.md 等约定文件");
    }
  }
}

function parseDocument(projectRoot, path) {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) throw new Error(`Markdown 文件包含二进制内容：${path}`);
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const { attributes, body } = parseFrontmatter(text);
  return {
    path,
    relativePath: projectRelative(projectRoot, path),
    attributes,
    body,
    sections: parseSections(body)
  };
}

function parseFrontmatter(text) {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return { attributes: {}, body: normalized };
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return { attributes: {}, body: normalized };

  const attributes = {};
  const lines = normalized.slice(4, end).split("\n");
  let currentKey = null;
  let blockStyle = null;
  let blockLines = [];

  const flushBlock = () => {
    if (!currentKey || !blockStyle) return;
    attributes[currentKey] = blockStyle === ">"
      ? blockLines.map((line) => line.trim()).join(" ").trim()
      : blockLines.join("\n").trim();
    blockStyle = null;
    blockLines = [];
  };

  for (const line of lines) {
    const property = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (property) {
      flushBlock();
      currentKey = property[1].toLowerCase().replaceAll("-", "_");
      const rawValue = (property[2] || "").trim();
      if (rawValue === "|" || rawValue === ">") {
        blockStyle = rawValue;
        blockLines = [];
      } else if (!rawValue) {
        attributes[currentKey] = [];
      } else {
        attributes[currentKey] = parseFrontmatterValue(rawValue);
      }
      continue;
    }
    if (blockStyle && /^\s+/.test(line)) {
      blockLines.push(line.replace(/^\s{1,4}/, ""));
      continue;
    }
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (currentKey && listItem) {
      if (!Array.isArray(attributes[currentKey])) attributes[currentKey] = [];
      attributes[currentKey].push(unquote(listItem[1].trim()));
    }
  }
  flushBlock();
  return {
    attributes,
    body: normalized.slice(end + 5)
  };
}

function parseFrontmatterValue(rawValue) {
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) return parsed.map((value) => String(value));
    } catch {
      return rawValue.slice(1, -1).split(",").map((value) => unquote(value.trim()));
    }
  }
  return unquote(rawValue);
}

function parseSections(body) {
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const sections = [];
  let current = { heading: "", level: 0, lines: [] };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      sections.push({
        heading: normalizeHeading(current.heading),
        rawHeading: current.heading,
        level: current.level,
        body: current.lines.join("\n").trim()
      });
      current = {
        heading: cleanInline(heading[2]),
        level: heading[1].length,
        lines: []
      };
    } else {
      current.lines.push(line);
    }
  }
  sections.push({
    heading: normalizeHeading(current.heading),
    rawHeading: current.heading,
    level: current.level,
    body: current.lines.join("\n").trim()
  });
  return sections;
}

function selectPrimaryDocument(format, documents) {
  const priorities = format === "openspec"
    ? ["proposal.md", "spec.md", "design.md", "tasks.md"]
    : format === "spec-kit"
      ? ["spec.md", "plan.md", "tasks.md", "research.md", "quickstart.md"]
      : ["readme.md", "spec.md"];
  return [...documents].sort((left, right) => {
    const leftRank = documentRank(left, priorities);
    const rightRank = documentRank(right, priorities);
    return leftRank - rightRank || left.relativePath.localeCompare(right.relativePath);
  })[0];
}

function documentRank(document, priorities) {
  const index = priorities.indexOf(basename(document.path).toLowerCase());
  return index === -1 ? priorities.length : index;
}

function extractTitle(document) {
  const explicit = firstString(document.attributes.title);
  if (explicit) return cleanInline(explicit);
  const heading = document.sections.find((section) => section.level === 1)?.rawHeading;
  if (heading) return cleanInline(heading);
  const stem = basename(document.path, extname(document.path))
    .replace(/^\d+[-_]?/, "")
    .replaceAll(/[-_]+/g, " ")
    .trim();
  return stem ? stem[0].toUpperCase() + stem.slice(1) : "Untitled spec";
}

function extractDescription(document) {
  const explicit = firstString(document.attributes.description);
  if (explicit) return cleanMarkdownText(explicit);
  const section = document.sections.find((entry) => (
    DESCRIPTION_HEADINGS.has(entry.heading) && cleanMarkdownText(entry.body)
  ));
  if (section) return cleanMarkdownText(section.body);

  const preamble = document.sections.find((entry) => entry.level === 0);
  const fallback = firstParagraph(preamble?.body || "");
  if (fallback) return cleanMarkdownText(fallback);
  const firstContent = document.sections.find((entry) => (
    entry.level > 0
    && !COMMAND_HEADINGS.has(entry.heading)
    && cleanMarkdownText(entry.body)
  ));
  return firstContent ? cleanMarkdownText(firstParagraph(firstContent.body)) : "";
}

function extractAcceptanceCommands(document) {
  const frontmatter = [
    ...asList(document.attributes.acceptance_commands),
    ...asList(document.attributes.verification_commands),
    ...asList(document.attributes.test_commands)
  ];
  const sections = document.sections
    .filter((section) => COMMAND_HEADINGS.has(section.heading))
    .flatMap((section) => commandsFromSection(section.body));
  return unique([...frontmatter, ...sections].map(cleanCommand).filter(Boolean));
}

function commandsFromSection(body) {
  const commands = [];
  const fenced = /```(?:bash|sh|shell|zsh|console)?\s*\n([\s\S]*?)```/gi;
  let match;
  while ((match = fenced.exec(body)) !== null) {
    commands.push(...match[1].split("\n"));
  }
  const withoutFences = body.replace(fenced, "");
  for (const line of withoutFences.split("\n")) {
    const listItem = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/);
    const prompt = line.match(/^\s*\$\s+(.+)$/);
    if (!listItem && !prompt) continue;
    const value = listItem?.[1] || prompt?.[1] || "";
    const inlineCode = [...value.matchAll(/`([^`]+)`/g)].map((entry) => entry[1]);
    commands.push(...(inlineCode.length > 0 ? inlineCode : [value]));
  }
  return commands;
}

function cleanCommand(value) {
  const command = cleanInline(String(value))
    .replace(/^\$\s+/, "")
    .trim();
  if (!command || command.startsWith("#")) return "";
  return command;
}

function extractEvidenceRefs(projectRoot, document) {
  const refs = [
    ...asList(document.attributes.evidence_refs),
    ...asList(document.attributes.evidence)
  ];
  for (const section of document.sections.filter((entry) => (
    EVIDENCE_HEADINGS.has(entry.heading)
  ))) {
    refs.push(...valuesFromSection(section.body, true));
  }
  return unique(refs.map((ref) => normalizeEvidenceRef(
    projectRoot,
    dirname(document.path),
    ref
  )).filter(Boolean));
}

function normalizeEvidenceRef(projectRoot, documentDir, value) {
  let ref = cleanInline(String(value)).trim();
  const markdownLink = ref.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  if (markdownLink) ref = markdownLink[1].trim();
  if (!ref || ref.startsWith("#")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return ref;

  const candidate = isAbsolute(ref)
    ? resolve(ref)
    : ref.startsWith(".")
      ? resolve(documentDir, ref)
      : resolve(projectRoot, ref);
  assertInsideProject(projectRoot, candidate);
  return projectRelative(projectRoot, candidate);
}

function extractAffectedAreas(document) {
  const values = [
    ...asList(document.attributes.affected_area),
    ...asList(document.attributes.affected_areas),
    ...asList(document.attributes.affected_components)
  ];
  for (const section of document.sections.filter((entry) => (
    AFFECTED_AREA_HEADINGS.has(entry.heading)
  ))) {
    values.push(...valuesFromSection(section.body));
  }
  return unique(values.flatMap(splitCommaSeparated).map(cleanInline).filter(Boolean));
}

function valuesFromSection(body, preserveMarkdownLinks = false) {
  const values = [];
  for (const line of body.split("\n")) {
    const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (!item) continue;
    let value = item[1].trim();
    if (!preserveMarkdownLinks) value = value.replace(/^\[([^\]]+)\]\([^)]+\)$/, "$1");
    values.push(value);
  }
  return values;
}

function checksumFiles(projectRoot, files) {
  const hash = createHash("sha256");
  for (const path of [...files].sort((left, right) => (
    projectRelative(projectRoot, left).localeCompare(projectRelative(projectRoot, right))
  ))) {
    const contents = readFileSync(path);
    hash.update(projectRelative(projectRoot, path));
    hash.update("\0");
    hash.update(String(contents.byteLength));
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function asList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  return splitCommaSeparated(String(value));
}

function splitCommaSeparated(value) {
  return String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function firstString(value) {
  return asList(value)[0] || "";
}

function firstParagraph(value) {
  return String(value).split(/\n\s*\n/).find((part) => cleanMarkdownText(part)) || "";
}

function normalizeHeading(value) {
  return cleanInline(value).toLowerCase().replace(/[:：]+$/, "").trim();
}

function cleanInline(value) {
  let text = unquote(String(value)).trim();
  for (const marker of ["`", "**", "__", "~~"]) {
    if (
      text.length > marker.length * 2
      && text.startsWith(marker)
      && text.endsWith(marker)
    ) {
      text = text.slice(marker.length, -marker.length).trim();
      break;
    }
  }
  return text;
}

function cleanMarkdownText(value) {
  return String(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function unquote(value) {
  const text = String(value).trim();
  if (
    text.length >= 2
    && ((text.startsWith('"') && text.endsWith('"'))
      || (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function unique(values) {
  return [...new Set(values)];
}

function projectRelative(projectRoot, path) {
  return relative(projectRoot, path).split(sep).join("/");
}
