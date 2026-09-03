#!/usr/bin/env node
/**
 * 启动一个本地静态文件 HTTP 服务，用来在浏览器里预览 index.html 和 docs/、apps/ 等资源。
 *
 * 用法：
 *     node scripts/serve.js                       # 默认 3100 端口，服务仓库根目录
 *     node scripts/serve.js -p 8080               # 指定端口
 *     node scripts/serve.js -d ./docs             # 指定服务目录
 *     node scripts/serve.js -p 8080 -d ./docs     # 同时指定
 *
 * 行为：
 *     - 默认首页为 index.html（请求 / 时返回）
 *     - 按文件后缀设置 Content-Type，UTF-8 文本默认带 charset
 *     - 列出请求方法、路径、状态码、字节数和耗时
 *     - Ctrl+C 退出时打印再见日志
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DEFAULT = path.resolve(__dirname, "..");
const PORT_DEFAULT = 3100;

const MIME = {
  ".html": "text/html",
  ".htm":  "text/html",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".json": "application/json",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".txt":  "text/plain",
  ".md":   "text/markdown",
  ".map":  "application/json",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
};

function parseArgs(argv) {
  const opts = { port: PORT_DEFAULT, dir: ROOT_DEFAULT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-p" || a === "--port") {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        throw new Error(`非法端口: ${v}`);
      }
      opts.port = n;
    } else if (a === "-d" || a === "--dir") {
      const v = argv[++i];
      opts.dir = path.resolve(v);
    } else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${a}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`用法: node scripts/serve.js [-p 端口] [-d 目录]

选项:
  -p, --port <端口>   监听端口（默认 ${PORT_DEFAULT}）
  -d, --dir  <目录>   服务的根目录（默认仓库根）
  -h, --help          显示本帮助`);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  return /^(text\/|application\/(javascript|json))/.test(type)
    ? `${type}; charset=utf-8`
    : type;
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, "");
  const abs = path.resolve(root, normalized);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveFile(absPath, res, stat) {
  const headers = {
    "Content-Type": contentTypeFor(absPath),
    "Content-Length": stat.size,
    "Last-Modified": stat.mtime.toUTCString(),
  };
  res.writeHead(200, headers);
  fs.createReadStream(absPath).pipe(res);
}

const server = http.createServer((req, res) => {
  const start = Date.now();
  const urlPath = req.url || "/";

  const abs = safeJoin(opts.dir, urlPath);
  if (!abs) {
    send(res, 400, "Bad Request");
    log(req, 400, 0, start);
    return;
  }

  fs.stat(abs, (err, stat) => {
    if (err) {
      send(res, 404, "Not Found");
      log(req, 404, 0, start);
      return;
    }
    if (stat.isDirectory()) {
      const indexPath = path.join(abs, "index.html");
      fs.access(indexPath, fs.constants.F_OK, (e) => {
        if (e) {
          send(res, 403, "Forbidden");
          log(req, 403, 0, start);
          return;
        }
        const indexStat = fs.statSync(indexPath);
        serveFile(indexPath, res, indexStat);
        log(req, 200, indexStat.size, start);
      });
      return;
    }
    serveFile(abs, res, stat);
    log(req, 200, stat.size, start);
  });
});

function log(req, status, bytes, start) {
  const ms = Date.now() - start;
  console.log(`${req.method} ${req.url} -> ${status} ${bytes}B ${ms}ms`);
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`✗ ${e.message}`);
  printHelp();
  process.exit(1);
}

server.listen(opts.port, () => {
  console.log(`✓ HTTP 服务已启动`);
  console.log(`  地址: http://localhost:${opts.port}`);
  console.log(`  目录: ${opts.dir}`);
  console.log(`  停止: Ctrl+C`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`\n收到 ${sig}，关闭服务...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
