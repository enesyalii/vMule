/**
 * Decode Android binary XML (AXML) to a readable XML string.
 * Covers AndroidManifest.xml and other compiled XML resources.
 */

function readU16(buf, off) {
  return buf.readUInt16LE(off);
}

function readU32(buf, off) {
  return buf.readUInt32LE(off);
}

function readLen16(buf, off) {
  const len = readU16(buf, off);
  return { len, str: buf.toString("utf16le", off + 2, off + 2 + len * 2), next: off + 2 + len * 2 };
}

function readStringPool(buf, off) {
  const chunkSize = readU32(buf, off + 4);
  const stringCount = readU32(buf, off + 8);
  const flags = readU32(buf, off + 16);
  const stringsStart = readU32(buf, off + 20);
  const isUtf8 = (flags & (1 << 8)) !== 0;

  const offsets = [];
  for (let i = 0; i < stringCount; i++) {
    offsets.push(readU32(buf, off + 28 + i * 4));
  }

  const base = off + stringsStart;
  const strings = [];

  for (let i = 0; i < stringCount; i++) {
    let pos = base + offsets[i];
    if (isUtf8) {
      let u8Len = buf[pos];
      if (u8Len & 0x80) {
        pos += 2;
      } else {
        pos += 1;
      }
      let u8Len2 = buf[pos];
      if (u8Len2 & 0x80) pos += 2;
      else pos += 1;
      const end = buf.indexOf(0, pos);
      strings.push(buf.toString("utf8", pos, end));
    } else {
      const chunk = readLen16(buf, pos);
      strings.push(chunk.str);
    }
  }

  return { strings, end: off + chunkSize };
}

function attrName(strings, idx) {
  if (idx < 0 || idx >= strings.length) return `?attr/${idx}`;
  return strings[idx];
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function typedValue(buf, off, strings) {
  const dataType = buf.readUInt8(off + 3);
  const data = readU32(buf, off + 4);
  const ref = readU32(buf, off + 8);

  switch (dataType) {
    case 0x03:
      return `"${escapeXml(strings[data] || "")}"`;
    case 0x10:
      return String(data);
    case 0x11:
      return `0x${data.toString(16)}`;
    case 0x12:
      return data ? "true" : "false";
    case 0x01:
      return `@${ref.toString(16)}`;
    default:
      return `{type:${dataType},data:${data},ref:${ref}}`;
  }
}

function decodeAxml(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < 8 || buffer.toString("utf8", 0, 4) !== "\x03\x00\x08\x00") {
    const text = buffer.toString("utf8");
    if (text.trimStart().startsWith("<")) return text;
    throw new Error("Not a valid AXML file");
  }

  let off = 8;
  const strings = [];
  let xmlStart = off;

  while (off < buffer.length) {
    const chunkType = readU16(buffer, off);
    const chunkSize = readU32(buffer, off + 4);
    if (chunkType === 0x0001) {
      const pool = readStringPool(buffer, off);
      strings.push(...pool.strings);
      off = pool.end;
      continue;
    }
    if (chunkType === 0x0100) {
      xmlStart = off;
      break;
    }
    off += chunkSize || 8;
  }

  const lines = ['<?xml version="1.0" encoding="utf-8"?>'];
  const stack = [];

  off = xmlStart;
  while (off < buffer.length) {
    const chunkType = readU16(buffer, off);
    const chunkSize = readU32(buffer, off + 4);
    if (!chunkSize) break;

    if (chunkType === 0x0102) {
      const lineNum = readU32(buffer, off + 8);
      const nameIdx = readU32(buffer, off + 20);
      const attrStart = readU16(buffer, off + 24);
      const attrCount = readU16(buffer, off + 28);
      const tag = attrName(strings, nameIdx);
      let attrs = "";
      let attrOff = off + attrStart;
      for (let i = 0; i < attrCount; i++) {
        const nsIdx = readU32(buffer, attrOff);
        const nameI = readU32(buffer, attrOff + 4);
        const raw = readU32(buffer, attrOff + 8);
        const valOff = attrOff + 12;
        const name = attrName(strings, nameI);
        const ns = nsIdx >= 0 ? ` xmlns:${name.split(":")[0]}="${escapeXml(strings[nsIdx] || "")}"` : "";
        const value = raw >= 0 ? `"${escapeXml(strings[raw] || "")}"` : typedValue(buffer, valOff + 8, strings);
        if (ns) attrs += ns;
        else attrs += ` ${name}=${value}`;
        attrOff += 20;
      }
      lines.push(`${"  ".repeat(stack.length)}<${tag}${attrs}>`);
      stack.push(tag);
    } else if (chunkType === 0x0103) {
      const tag = stack.pop() || "node";
      lines.push(`${"  ".repeat(stack.length)}</${tag}>`);
    } else if (chunkType === 0x0104) {
      const raw = readU32(buffer, off + 16);
      const text = escapeXml(strings[raw] || "");
      lines.push(`${"  ".repeat(stack.length)}${text}`);
    }

    off += chunkSize;
  }

  return lines.join("\n");
}

module.exports = { decodeAxml, escapeXml };
