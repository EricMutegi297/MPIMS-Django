import api from "../axiosConfig";

function messageFromError(error, label) {
  if (error?.fileMessage) return error.fileMessage;
  const status = error?.response?.status;
  if (status === 401) return `Sign in again before opening the ${label}.`;
  if (status === 403) return `You do not have permission to open the ${label}.`;
  if (status === 404) return `The ${label} could not be found on the server.`;
  return `Unable to open the ${label}.`;
}

function writeViewerMessage(viewer, message) {
  try {
    viewer.document.title = "Opening document";
    viewer.document.body.style.fontFamily = "Arial, sans-serif";
    viewer.document.body.style.padding = "24px";
    viewer.document.body.textContent = "";
    const paragraph = viewer.document.createElement("p");
    paragraph.textContent = message;
    viewer.document.body.appendChild(paragraph);
  } catch {
    // Some browsers restrict the placeholder window; the blob navigation can still work.
  }
}

function fileOpenError(message) {
  const error = new Error(message);
  error.fileMessage = message;
  return error;
}

function normalizeProtectedFileUrl(url) {
  if (!url || typeof window === "undefined") return url;

  try {
    const parsed = new URL(url, window.location.origin);
    const isSameHost = parsed.hostname === window.location.hostname;
    if (window.location.protocol === "https:" && parsed.protocol === "http:" && isSameHost) {
      parsed.protocol = "https:";
    }
    return parsed.href;
  } catch {
    return url;
  }
}

function filenameFromUrl(url, fallback) {
  try {
    const parsed = new URL(url, window.location.origin);
    const name = parsed.pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : fallback;
  } catch {
    return fallback;
  }
}

function filenameFromDisposition(disposition) {
  if (!disposition) return "";
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch) {
    try {
      return decodeURIComponent(utfMatch[1].trim());
    } catch {
      return utfMatch[1].trim();
    }
  }
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1].trim() : "";
}

function inferContentType(contentType, url, fileName) {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
  const target = `${fileName || ""} ${url || ""}`.toLowerCase().split("?")[0];
  const isGeneric = !normalized || normalized === "application/octet-stream" || normalized === "binary/octet-stream";

  if (isGeneric || normalized === "application/force-download") {
    if (target.endsWith(".pdf")) return "application/pdf";
    if (target.endsWith(".png")) return "image/png";
    if (target.endsWith(".jpg") || target.endsWith(".jpeg")) return "image/jpeg";
    if (target.endsWith(".webp")) return "image/webp";
    if (target.endsWith(".gif")) return "image/gif";
    if (target.endsWith(".txt")) return "text/plain";
    if (target.endsWith(".csv")) return "text/csv";
  }

  return normalized || "application/octet-stream";
}

async function rejectHtmlFallback(blob, contentType, label) {
  if (!contentType.includes("text/html")) return;
  const text = await blob.text();
  const looksLikeAppShell = /<div[^>]+id=["']root["']/i.test(text) || /static\/js\/main/i.test(text);
  if (looksLikeAppShell || /<!doctype html/i.test(text)) {
    throw fileOpenError(
      `The ${label} could not be opened because the server returned a web page instead of the file.`
    );
  }
}

function buildViewer(viewer, objectUrl, { label, fileName, contentType }) {
  try {
    const doc = viewer.document;
    doc.title = fileName || `MPIMS ${label}`;
    doc.body.textContent = "";
    doc.body.style.margin = "0";
    doc.body.style.background = "#111827";
    doc.body.style.color = "#e5e7eb";
    doc.body.style.fontFamily = "Arial, sans-serif";

    const bar = doc.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;background:#0f172a;border-bottom:1px solid #334155;";

    const title = doc.createElement("div");
    title.textContent = fileName || label;
    title.style.cssText = "font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";

    const download = doc.createElement("a");
    download.href = objectUrl;
    download.download = fileName || label;
    download.textContent = "Download";
    download.style.cssText = "flex:0 0 auto;padding:8px 12px;border-radius:6px;background:#2563eb;color:white;text-decoration:none;font-size:13px;font-weight:700;";

    bar.appendChild(title);
    bar.appendChild(download);

    const stage = doc.createElement("div");
    stage.style.cssText = "height:calc(100vh - 54px);background:white;";

    if (contentType.startsWith("image/")) {
      stage.style.cssText += "display:flex;align-items:center;justify-content:center;overflow:auto;";
      const img = doc.createElement("img");
      img.src = objectUrl;
      img.alt = label;
      img.style.cssText = "max-width:100%;max-height:100%;";
      stage.appendChild(img);
    } else {
      const frame = doc.createElement("iframe");
      frame.src = objectUrl;
      frame.title = fileName || label;
      frame.style.cssText = "width:100%;height:100%;border:0;background:white;";
      stage.appendChild(frame);
    }

    doc.body.appendChild(bar);
    doc.body.appendChild(stage);
  } catch {
    viewer.location.href = objectUrl;
  }
}

export async function openProtectedFile(url, { label = "document", onError } = {}) {
  if (!url) {
    const message = `No ${label} is attached.`;
    onError?.(message);
    return false;
  }

  const viewer = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (viewer) {
    writeViewerMessage(viewer, `Opening ${label}...`);
  }

  try {
    const safeUrl = normalizeProtectedFileUrl(url);
    const response = await api.get(safeUrl, {
      responseType: "blob",
      skipAuthRedirect: true,
    });
    const fileName =
      filenameFromDisposition(response.headers?.["content-disposition"]) ||
      filenameFromUrl(safeUrl, label);
    const contentType = inferContentType(response.headers?.["content-type"], safeUrl, fileName);
    const responseBlob = response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: contentType });
    const blob = responseBlob.type === contentType
      ? responseBlob
      : new Blob([responseBlob], { type: contentType });

    if (blob.size === 0) {
      throw fileOpenError(`The ${label} file is empty.`);
    }
    await rejectHtmlFallback(blob, contentType, label);

    const objectUrl = URL.createObjectURL(blob);

    if (viewer && !viewer.closed) {
      buildViewer(viewer, objectUrl, { label, fileName, contentType });
    } else {
      const opened = window.open(objectUrl, "_blank");
      if (!opened) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Popup blocked");
      }
    }

    if (viewer && !viewer.closed) {
      try {
        viewer.addEventListener("beforeunload", () => URL.revokeObjectURL(objectUrl), { once: true });
      } catch {
        // The timed cleanup below still releases the blob URL.
      }
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15 * 60 * 1000);
    return true;
  } catch (error) {
    const message = messageFromError(error, label);
    if (viewer && !viewer.closed) {
      writeViewerMessage(viewer, message);
    }
    onError?.(message);
    return false;
  }
}
