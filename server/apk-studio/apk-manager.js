const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const { decodeAxml } = require("./axml");

const SESSION_TTL_MS = 60 * 60 * 1000;
const sessions = new Map();

function sessionDir() {
  const base = process.env.APK_STUDIO_DIR || path.join(process.cwd(), ".apk-studio-sessions");
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastAccess > SESSION_TTL_MS) {
      try {
        fs.rmSync(s.workDir, { recursive: true, force: true });
      } catch (_) {}
      sessions.delete(id);
    }
  }
}

function touch(session) {
  session.lastAccess = Date.now();
}

function safePath(entryPath) {
  const normalized = path.normalize(entryPath).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Invalid path");
  }
  return normalized.replace(/\\/g, "/");
}

function buildTree(entries) {
  const root = { name: "", path: "", type: "dir", children: [] };
  const dirs = new Map([["", root]]);

  for (const entry of entries) {
    const parts = entry.entryName.replace(/\/$/, "").split("/").filter(Boolean);
    let currentPath = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1 && !entry.isDirectory;
      const nextPath = currentPath ? `${currentPath}/${part}` : part;
      if (!dirs.has(nextPath)) {
        const node = {
          name: part,
          path: nextPath,
          type: isFile ? "file" : "dir",
          size: isFile ? entry.header.size : 0,
          compressedSize: isFile ? entry.header.compressedSize : 0,
          children: isFile ? undefined : [],
        };
        dirs.get(currentPath).children.push(node);
        if (!isFile) dirs.set(nextPath, node);
      }
      currentPath = nextPath;
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  };
  sortNodes(root.children);
  return root.children;
}

function manifestSummary(workDir) {
  const manifestPath = path.join(workDir, "AndroidManifest.xml");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const raw = fs.readFileSync(manifestPath);
    const xml = decodeAxml(raw);
    const pkg = xml.match(/package="([^"]+)"/)?.[1] || null;
    const versionName = xml.match(/android:versionName="([^"]+)"/)?.[1] || null;
    const versionCode = xml.match(/android:versionCode="([^"]+)"/)?.[1] || null;
    const appLabel = xml.match(/android:label="([^"]+)"/)?.[1] || null;
    return { package: pkg, versionName, versionCode, appLabel, xmlPreview: xml.split("\n").slice(0, 30).join("\n") };
  } catch (_) {
    return null;
  }
}

function detectViewMode(entryPath, buffer) {
  const lower = entryPath.toLowerCase();
  if (lower.endsWith(".xml")) {
    if (buffer[0] === 0x03 && buffer[1] === 0x00) return "axml";
    return "text";
  }
  if (lower.endsWith(".json") || lower.endsWith(".txt") || lower.endsWith(".properties") ||
      lower.endsWith(".mf") || lower.endsWith(".sf") || lower.endsWith(".rsa") ||
      lower.endsWith(".pro") || lower.endsWith(".kotlin_module")) {
    return "text";
  }
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") ||
      lower.endsWith(".webp") || lower.endsWith(".gif")) {
    return "image";
  }
  if (lower.endsWith(".dex")) return "dex";
  return "binary";
}

function dexHeaderInfo(buffer) {
  if (buffer.length < 112 || buffer.toString("ascii", 0, 4) !== "dex\n") {
    return { valid: false };
  }
  return {
    valid: true,
    version: buffer.toString("ascii", 4, 7),
    checksum: buffer.readUInt32LE(8).toString(16),
    fileSize: buffer.readUInt32LE(32),
    headerSize: buffer.readUInt32LE(36),
    stringIds: buffer.readUInt32LE(56),
    typeIds: buffer.readUInt32LE(60),
    protoIds: buffer.readUInt32LE(64),
    fieldIds: buffer.readUInt32LE(68),
    methodIds: buffer.readUInt32LE(72),
    classDefs: buffer.readUInt32LE(76),
  };
}

class ApkManager {
  openFromBuffer(buffer, filename = "upload.apk") {
    pruneSessions();
    const id = crypto.randomUUID().replace(/-/g, "");
    const workDir = path.join(sessionDir(), id);
    fs.mkdirSync(workDir, { recursive: true });

    const zip = new AdmZip(buffer);
    zip.extractAllTo(workDir, true);

    const entries = zip.getEntries();
    const session = {
      id,
      filename,
      workDir,
      zipPath: path.join(workDir, "__source.apk"),
      lastAccess: Date.now(),
      dirty: false,
      tree: buildTree(entries),
      size: buffer.length,
      entryCount: entries.length,
      manifest: null,
    };
    fs.writeFileSync(session.zipPath, buffer);
    session.manifest = manifestSummary(workDir);
    sessions.set(id, session);
    return this.sessionInfo(session);
  }

  openFromPath(filePath) {
    const buffer = fs.readFileSync(filePath);
    return this.openFromBuffer(buffer, path.basename(filePath));
  }

  getSession(id) {
    const session = sessions.get(id);
    if (!session) return null;
    touch(session);
    return session;
  }

  sessionInfo(session) {
    return {
      id: session.id,
      filename: session.filename,
      size: session.size,
      entryCount: session.entryCount,
      dirty: session.dirty,
      manifest: session.manifest,
      tree: session.tree,
    };
  }

  readEntry(id, entryPath) {
    const session = this.getSession(id);
    if (!session) throw new Error("Session not found");
    const rel = safePath(entryPath);
    const full = path.join(session.workDir, rel);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      throw new Error("Entry not found");
    }
    const buffer = fs.readFileSync(full);
    const mode = detectViewMode(rel, buffer);
    const info = {
      path: rel,
      size: buffer.length,
      mode,
    };

    if (mode === "axml") {
      info.parsed = decodeAxml(buffer);
      info.encoding = "axml";
    } else if (mode === "text") {
      info.text = buffer.toString("utf8");
      info.encoding = "utf8";
    } else if (mode === "image") {
      info.mime = rel.endsWith(".png") ? "image/png"
        : rel.endsWith(".webp") ? "image/webp"
        : "image/jpeg";
      info.base64 = buffer.toString("base64");
    } else if (mode === "dex") {
      info.dex = dexHeaderInfo(buffer);
    }

    info.hexPreview = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("hex");
    return info;
  }

  readHex(id, entryPath, offset = 0, length = 4096) {
    const session = this.getSession(id);
    if (!session) throw new Error("Session not found");
    const rel = safePath(entryPath);
    const full = path.join(session.workDir, rel);
    const buffer = fs.readFileSync(full);
    const start = Math.max(0, Number(offset) || 0);
    const len = Math.min(Number(length) || 4096, 65536, buffer.length - start);
    return {
      path: rel,
      offset: start,
      total: buffer.length,
      hex: buffer.subarray(start, start + len).toString("hex"),
    };
  }

  writeEntry(id, entryPath, content, encoding = "utf8") {
    const session = this.getSession(id);
    if (!session) throw new Error("Session not found");
    const rel = safePath(entryPath);
    const full = path.join(session.workDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const buf = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, encoding);
    fs.writeFileSync(full, buf);
    session.dirty = true;
    const zip = new AdmZip();
    this.addDirToZip(zip, session.workDir, "");
    session.tree = buildTree(zip.getEntries());
    if (rel.toLowerCase() === "androidmanifest.xml") {
      session.manifest = manifestSummary(session.workDir);
    }
    return { ok: true, path: rel, size: buf.length };
  }

  addDirToZip(zip, baseDir, prefix) {
    for (const name of fs.readdirSync(baseDir)) {
      if (name === "__source.apk") continue;
      const full = path.join(baseDir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(full).isDirectory()) {
        this.addDirToZip(zip, full, rel);
      } else {
        zip.addFile(rel, fs.readFileSync(full));
      }
    }
  }

  exportApk(id) {
    const session = this.getSession(id);
    if (!session) throw new Error("Session not found");
    const zip = new AdmZip();
    this.addDirToZip(zip, session.workDir, "");
    const out = zip.toBuffer();
    session.dirty = false;
    return { buffer: out, filename: session.filename.replace(/\.apk$/i, "") + "-edited.apk" };
  }

  extractEntry(id, entryPath) {
    const session = this.getSession(id);
    if (!session) throw new Error("Session not found");
    const rel = safePath(entryPath);
    const full = path.join(session.workDir, rel);
    return { buffer: fs.readFileSync(full), filename: path.basename(rel) };
  }

  createBlankApk(options = {}) {
    const pkg = options.package || "com.example.app";
    const label = options.label || "My App";
    const versionName = options.versionName || "1.0";
    const versionCode = options.versionCode || "1";

    const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pkg}"
    android:versionCode="${versionCode}"
    android:versionName="${versionName}">
    <application android:label="${label}" android:allowBackup="true">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

    const zip = new AdmZip();
    zip.addFile("AndroidManifest.xml", Buffer.from(manifest, "utf8"));
    zip.addFile("resources.arsc", Buffer.alloc(0));
    const buffer = zip.toBuffer();
    return this.openFromBuffer(buffer, `${pkg.split(".").pop() || "app"}.apk`);
  }

  closeSession(id) {
    const session = sessions.get(id);
    if (!session) return false;
    try {
      fs.rmSync(session.workDir, { recursive: true, force: true });
    } catch (_) {}
    sessions.delete(id);
    return true;
  }
}

module.exports = { ApkManager, safePath };
