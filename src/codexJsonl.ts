const minImportedTextLength = 8;
const maxImportedTextLength = 12000;

export function extractCodexJsonlText(jsonlText: string): string {
  const lines = jsonlText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  const collectedText: string[] = [];
  const seenText = new Set<string>();

  for (const line of lines) {
    let record: unknown;

    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const recordText = extractCodexRecordText(record);
    const cleanText = normalizeImportedText(recordText);

    if (!cleanText) continue;
    if (seenText.has(cleanText)) continue;

    seenText.add(cleanText);
    collectedText.push(cleanText);
  }

  return collectedText.join("\n\n");
}

function extractCodexRecordText(record: unknown): string {
  if (!record || typeof record !== "object") return "";

  const eventRecord = record as Record<string, unknown>;
  const eventType = typeof eventRecord.type === "string" ? eventRecord.type : "";

  if (eventType === "session_meta" || eventType === "turn_context") {
    return "";
  }

  if (eventType === "response_item") {
    return extractMessageText(eventRecord.payload);
  }

  return extractMessageText(eventRecord.payload) || extractMessageText(eventRecord);
}

function extractMessageText(value: unknown): string {
  if (!value || typeof value !== "object") return "";

  const messageRecord = value as Record<string, unknown>;
  const itemType = typeof messageRecord.type === "string" ? messageRecord.type : "";
  const role = typeof messageRecord.role === "string" ? messageRecord.role : "";

  if (itemType !== "message") return "";
  if (role !== "user" && role !== "assistant") return "";

  return readMessageContent(messageRecord.content);
}

function readMessageContent(value: unknown): string {
  if (typeof value === "string") {
    return isMeaningfulImportedText(value) ? value : "";
  }

  if (!Array.isArray(value)) return "";

  const parts: string[] = [];

  for (const item of value) {
    if (typeof item === "string") {
      if (isMeaningfulImportedText(item)) {
        parts.push(item);
      }

      continue;
    }

    if (!item || typeof item !== "object") continue;

    const contentItem = item as Record<string, unknown>;
    const itemType = typeof contentItem.type === "string" ? contentItem.type : "";

    if (itemType !== "input_text" && itemType !== "output_text" && itemType !== "text") {
      continue;
    }

    if (typeof contentItem.text === "string" && isMeaningfulImportedText(contentItem.text)) {
      parts.push(contentItem.text);
    }
  }

  return parts.join("\n");
}

function normalizeImportedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isMeaningfulImportedText(text: string): boolean {
  const trimmedText = text.trim();

  if (trimmedText.length < minImportedTextLength) return false;
  if (trimmedText.length > maxImportedTextLength) return false;

  if (/^[a-f0-9-]{20,}$/i.test(trimmedText)) return false;
  if (/^\d+$/.test(trimmedText)) return false;
  if (trimmedText.startsWith("{") && trimmedText.endsWith("}")) return false;
  if (trimmedText.includes('"type"') && trimmedText.includes('"timestamp"')) return false;

  return true;
}
