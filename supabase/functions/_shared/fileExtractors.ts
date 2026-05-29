export type ExtractStatus = "parsed" | "partial" | "unsupported" | "failed";

export type ExtractWarning = {
  code: string;
  message: string;
};

export type ExtractResult = {
  status: ExtractStatus;
  text: string;
  warnings: ExtractWarning[];
};

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: false });

const M = {
  docxEmpty: "docx \u6587\u4ef6\u672a\u80fd\u63d0\u53d6\u5230\u6b63\u6587\u6587\u672c\u3002",
  pptxEmpty: "pptx \u6587\u4ef6\u5df2\u4e0a\u4f20\u6210\u529f\uff0c\u4f46\u5f53\u524d\u6682\u4e0d\u652f\u6301\u7a33\u5b9a\u6b63\u6587\u89e3\u6790\uff0c\u672a\u80fd\u63d0\u53d6\u5230\u53ef\u7528\u6587\u672c\u3002",
  pdfLimited: "PDF \u6587\u4ef6\u5df2\u4e0a\u4f20\u6210\u529f\uff0c\u4f46\u5f53\u524d\u6682\u4e0d\u652f\u6301\u7a33\u5b9a\u6b63\u6587\u89e3\u6790\uff1b\u53ef\u80fd\u662f\u626b\u63cf\u4ef6\uff0c\u6216\u5f53\u524d\u89e3\u6790\u80fd\u529b\u6709\u9650\uff0c\u672a\u80fd\u63d0\u53d6\u5230\u53ef\u7528\u6587\u672c\u3002",
  pdfPartial: "PDF \u6587\u4ef6\u5df2\u4e0a\u4f20\u6210\u529f\uff0c\u4f46\u5f53\u524d\u6682\u4e0d\u652f\u6301\u7a33\u5b9a\u6b63\u6587\u89e3\u6790\uff1bAI \u53ea\u4f1a\u57fa\u4e8e\u6210\u529f\u63d0\u53d6\u5230\u7684\u7247\u6bb5\u56de\u7b54\uff0c\u4e0d\u4ee3\u8868\u5df2\u8bfb\u53d6\u5168\u6587\u3002",
  textEmpty: "\u6587\u4ef6\u6587\u672c\u5185\u5bb9\u4e3a\u7a7a\u3002",
  pptUnsupported: "PPT \u6587\u4ef6\u5df2\u4e0a\u4f20\u6210\u529f\uff0c\u4f46\u65e7\u7248 ppt \u4e8c\u8fdb\u5236\u683c\u5f0f\u5f53\u524d\u6682\u4e0d\u652f\u6301\u7a33\u5b9a\u6b63\u6587\u89e3\u6790\uff0c\u53ef\u80fd\u65e0\u6cd5\u88ab AI \u5b8c\u6574\u8bfb\u53d6\u3002",
  pptxPartial: "PPTX \u6587\u4ef6\u5df2\u4e0a\u4f20\u6210\u529f\uff0c\u4f46\u5f53\u524d\u6682\u4e0d\u652f\u6301\u7a33\u5b9a\u6b63\u6587\u89e3\u6790\uff1bAI \u53ea\u4f1a\u57fa\u4e8e\u6210\u529f\u63d0\u53d6\u5230\u7684\u6587\u672c\u6846\u7247\u6bb5\u56de\u7b54\uff0c\u4e0d\u4ee3\u8868\u5df2\u8bfb\u53d6\u5168\u6587\u3002",
  unknown: "\u672a\u77e5",
  unsupportedPrefix: "\u6682\u4e0d\u652f\u6301\u89e3\u6790",
  unsupportedSuffix: "\u683c\u5f0f\u3002",
  parseFailed: "\u6587\u4ef6\u89e3\u6790\u5931\u8d25\u3002",
  zipDirectoryMissing: "zip central directory \u7f3a\u5931\uff0c\u65e0\u6cd5\u7a33\u5b9a\u8bfb\u53d6\u6587\u6863\u5185\u5bb9\u3002",
  zipEntryUnsupported: "\u6587\u6863\u5185\u90e8\u6587\u4ef6\u4f7f\u7528\u4e86\u5f53\u524d\u4e0d\u652f\u6301\u7684 zip \u538b\u7f29\u65b9\u5f0f\u3002",
  slide: "\u7b2c",
  page: "\u9875",
};

function warning(code: string, message: string): ExtractWarning {
  return { code, message };
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripXml(xml: string) {
  return normalizeText(
    xml
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, " "),
  );
}

function decodeXmlEntities(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractXmlTextNodes(xml: string, tagName: string, paragraphTagName: string) {
  const textTag = tagName.replace(":", "\\:");
  const paragraphTag = paragraphTagName.replace(":", "\\:");
  const tokenPattern = new RegExp(
    `<${textTag}\\b[^>]*>([\\s\\S]*?)<\\/${textTag}>|<${paragraphTag}\\b[^>]*\\/?>|<\\/${paragraphTag}>|<[^:>]+:tab\\b[^>]*\\/?>|<[^:>]+:br\\b[^>]*\\/?>`,
    "g",
  );
  const pieces: string[] = [];
  for (const match of xml.matchAll(tokenPattern)) {
    const token = match[0];
    if (match[1] !== undefined) {
      pieces.push(decodeXmlEntities(match[1]), " ");
      continue;
    }
    if (new RegExp(`^<\\/${paragraphTag}>`).test(token) || /:br\b/.test(token)) {
      pieces.push("\n");
      continue;
    }
    if (/:tab\b/.test(token)) pieces.push(" ");
  }
  return normalizeText(pieces.join(""));
}

async function inflateRaw(data: Uint8Array) {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readUint16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

type ZipEntryMeta = {
  name: string;
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const minOffset = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readCentralDirectory(bytes: Uint8Array): ZipEntryMeta[] {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) return [];

  const entryCount = readUint16(bytes, eocdOffset + 10);
  const centralDirectorySize = readUint32(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(bytes, eocdOffset + 16);
  const entries: ZipEntryMeta[] = [];
  let offset = centralDirectoryOffset;
  const directoryEnd = Math.min(bytes.length, centralDirectoryOffset + centralDirectorySize);

  while (offset + 46 <= directoryEnd && entries.length < entryCount) {
    if (readUint32(bytes, offset) !== 0x02014b50) break;

    const compression = readUint16(bytes, offset + 10);
    const compressedSize = readUint32(bytes, offset + 20);
    const fileNameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localHeaderOffset = readUint32(bytes, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > directoryEnd) break;

    entries.push({
      name: TEXT_DECODER.decode(bytes.slice(nameStart, nameEnd)),
      compression,
      compressedSize,
      localHeaderOffset,
    });
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function readZipEntryCompressedData(bytes: Uint8Array, entry: ZipEntryMeta) {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.length || readUint32(bytes, offset) !== 0x04034b50) return null;

  const fileNameLength = readUint16(bytes, offset + 26);
  const extraLength = readUint16(bytes, offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart > bytes.length || dataEnd > bytes.length) return null;
  return bytes.slice(dataStart, dataEnd);
}

async function readZipTextEntries(bytes: Uint8Array, matcher: (name: string) => boolean) {
  const entries: Array<{ name: string; text: string }> = [];
  const directory = readCentralDirectory(bytes);
  if (!directory.length) {
    throw new Error(M.zipDirectoryMissing);
  }

  for (const entry of directory.filter((item) => matcher(item.name))) {
    const compressed = readZipEntryCompressedData(bytes, entry);
    if (!compressed) continue;

    let content: Uint8Array | null = null;
    if (entry.compression === 0) content = compressed;
    if (entry.compression === 8) content = await inflateRaw(compressed).catch(() => null);
    if (entry.compression !== 0 && entry.compression !== 8) {
      throw new Error(`${M.zipEntryUnsupported} (${entry.name}: method ${entry.compression})`);
    }
    if (content) entries.push({ name: entry.name, text: TEXT_DECODER.decode(content) });
  }

  return entries;
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractResult> {
  const entries = await readZipTextEntries(bytes, (name) => name === "word/document.xml");
  const text = normalizeText(entries.map((entry) => extractXmlTextNodes(entry.text, "w:t", "w:p")).join("\n\n"));
  if (!text) {
    return {
      status: "failed",
      text: "",
      warnings: [warning("DOCX_PARSE_EMPTY", M.docxEmpty)],
    };
  }
  return { status: "parsed", text, warnings: [] };
}

async function extractPptx(bytes: Uint8Array): Promise<ExtractResult> {
  const entries = await readZipTextEntries(bytes, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const text = normalizeText(
    entries
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((entry, index) => `${M.slide} ${index + 1} ${M.page}\n${extractXmlTextNodes(entry.text, "a:t", "a:p") || stripXml(entry.text)}`)
      .join("\n\n"),
  );
  if (!text) {
    return {
      status: "failed",
      text: "",
      warnings: [warning("PPTX_PARSE_EMPTY", M.pptxEmpty)],
    };
  }
  return {
    status: "partial",
    text,
    warnings: [warning("PPTX_PARSE_PARTIAL", M.pptxPartial)],
  };
}

function extractPdf(bytes: Uint8Array): ExtractResult {
  const raw = TEXT_DECODER.decode(bytes);
  const pieces = Array.from(raw.matchAll(/\(([^()]{2,500})\)\s*T[jJ]/g))
    .map((match) => match[1])
    .join("\n");
  const text = normalizeText(pieces.replace(/\\n/g, "\n").replace(/\\r/g, "\n").replace(/\\\(/g, "(").replace(/\\\)/g, ")"));

  if (!text) {
    return {
      status: "partial",
      text: "",
      warnings: [warning("PDF_PARSE_LIMITED", M.pdfLimited)],
    };
  }

  return {
    status: "partial",
    text,
    warnings: [warning("PDF_PARSE_PARTIAL", M.pdfPartial)],
  };
}

export async function extractFileText(fileType: string, bytes: Uint8Array): Promise<ExtractResult> {
  const type = fileType.toLowerCase().replace(/^\./, "");

  try {
    if (type === "txt" || type === "md" || type === "markdown") {
      const text = normalizeText(TEXT_DECODER.decode(bytes));
      return { status: text ? "parsed" : "partial", text, warnings: text ? [] : [warning("TEXT_EMPTY", M.textEmpty)] };
    }

    if (type === "pdf") return extractPdf(bytes);
    if (type === "docx") return await extractDocx(bytes);
    if (type === "pptx") return await extractPptx(bytes);

    if (type === "ppt") {
      return {
        status: "unsupported",
        text: "",
        warnings: [warning("PPT_UNSUPPORTED", M.pptUnsupported)],
      };
    }

    return {
      status: "unsupported",
      text: "",
      warnings: [warning("FILE_TYPE_UNSUPPORTED", `${M.unsupportedPrefix} ${fileType || M.unknown} ${M.unsupportedSuffix}`)],
    };
  } catch (error) {
    return {
      status: "failed",
      text: "",
      warnings: [warning("PARSE_FAILED", error instanceof Error ? error.message : M.parseFailed)],
    };
  }
}
