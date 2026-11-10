/**
 * Streaming scanners that yield every record of a data file together with its byte
 * position, so the index can store "where" instead of "what" and samples are read back
 * from the original file on demand.
 *
 * Both work on raw bytes: JSON's structural characters are ASCII, so they never occur
 * inside a multi-byte UTF-8 sequence.
 */
import type { Readable } from "node:stream";

export type ScannedRecord = {
  /** Byte offset of the record's first byte in the file. */
  offset: number;
  /** Byte length of the record (surrounding whitespace excluded). */
  length: number;
  /** The record's bytes. */
  bytes: Buffer;
  /** 1-based line (JSONL) or element (array) number, for error messages. */
  ordinal: number;
};

const NL = 0x0a;
const isWs = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;

/** Trims whitespace (and a UTF-8 BOM) from both ends of `buf`; returns [start, end). */
function trimBounds(buf: Buffer): [number, number] {
  let s = 0;
  let e = buf.length;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) s = 3;
  while (s < e && isWs(buf[s])) s++;
  while (e > s && isWs(buf[e - 1])) e--;
  return [s, e];
}

/** Non-empty lines of a JSONL stream with their byte offsets. */
export async function* scanLines(source: Readable): AsyncGenerator<ScannedRecord> {
  let pending: Buffer[] = [];
  let pendingStart = 0; // file offset of pending[0][0]
  let fileOffset = 0; // file offset of the current chunk's first byte
  let ordinal = 0;

  const emit = (line: Buffer, lineStart: number): ScannedRecord | null => {
    ordinal++;
    const [s, e] = trimBounds(line);
    if (s >= e) return null;
    return { offset: lineStart + s, length: e - s, bytes: line.subarray(s, e), ordinal };
  };

  for await (const chunk of source as AsyncIterable<Buffer>) {
    let start = 0;
    let nl = chunk.indexOf(NL, start);
    while (nl !== -1) {
      let line: Buffer;
      let lineStart: number;
      if (pending.length) {
        line = Buffer.concat([...pending, chunk.subarray(start, nl)]);
        lineStart = pendingStart;
        pending = [];
      } else {
        line = chunk.subarray(start, nl);
        lineStart = fileOffset + start;
      }
      const rec = emit(line, lineStart);
      if (rec) yield rec;
      start = nl + 1;
      nl = chunk.indexOf(NL, start);
    }
    if (start < chunk.length) {
      if (!pending.length) pendingStart = fileOffset + start;
      pending.push(chunk.subarray(start));
    }
    fileOffset += chunk.length;
  }
  if (pending.length) {
    const rec = emit(Buffer.concat(pending), pendingStart);
    if (rec) yield rec;
  }
}

/**
 * Top-level elements of a JSON array stream with their byte offsets. Tracks nesting and
 * string state byte by byte; elements are not parsed here.
 */
export async function* scanArray(source: Readable): AsyncGenerator<ScannedRecord> {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let elemStart = -1; // file offset of the current element, -1 when between elements
  let parts: Buffer[] = []; // bytes of the current element from earlier chunks
  let fileOffset = 0;
  let ordinal = 0;
  let closed = false;

  const finish = (chunk: Buffer, segStart: number, end: number): ScannedRecord | null => {
    const tail = chunk.subarray(segStart, end);
    const all = parts.length ? Buffer.concat([...parts, tail]) : tail;
    parts = [];
    let e = all.length;
    while (e > 0 && isWs(all[e - 1])) e--;
    const offset = elemStart;
    elemStart = -1;
    if (e === 0) return null;
    ordinal++;
    return { offset, length: e, bytes: all.subarray(0, e), ordinal };
  };

  for await (const chunk of source as AsyncIterable<Buffer>) {
    if (closed) break;
    let segStart = elemStart >= 0 ? 0 : -1;
    const out: ScannedRecord[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (b === 0x5c) escaped = true;
        else if (b === 0x22) inString = false;
        continue;
      }
      if (depth === 0) {
        if (b === 0x5b) depth = 1; // '[' opens the top-level array; anything before is ignored
        continue;
      }
      if (depth === 1) {
        if (b === 0x2c || b === 0x5d) {
          // ',' or ']' ends the current element
          if (elemStart >= 0) {
            const rec = finish(chunk, segStart, i);
            if (rec) out.push(rec);
            segStart = -1;
          }
          if (b === 0x5d) {
            depth = 0;
            closed = true;
            break;
          }
          continue;
        }
        if (isWs(b)) continue;
        if (elemStart < 0) {
          elemStart = fileOffset + i;
          segStart = i;
        }
      }
      if (b === 0x22) inString = true;
      else if (b === 0x7b || b === 0x5b) depth++;
      else if (b === 0x7d || b === 0x5d) depth--;
    }
    if (elemStart >= 0 && segStart >= 0) parts.push(chunk.subarray(segStart));
    fileOffset += chunk.length;
    for (const rec of out) yield rec;
  }
  if (!closed && depth > 0)
    throw new Error("JSON 배열이 중간에 끝났습니다 (파일이 잘렸을 수 있음).");
}
