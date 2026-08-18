import api from "../axiosConfig";

function messageFromError(error, label) {
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
    const response = await api.get(url, {
      responseType: "blob",
      skipAuthRedirect: true,
    });
    const contentType = response.headers?.["content-type"] || "application/octet-stream";
    const blob = response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: contentType });
    const objectUrl = URL.createObjectURL(blob);

    if (viewer && !viewer.closed) {
      viewer.location.href = objectUrl;
    } else {
      const opened = window.open(objectUrl, "_blank");
      if (!opened) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Popup blocked");
      }
    }

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return true;
  } catch (error) {
    if (viewer && !viewer.closed) {
      viewer.close();
    }
    onError?.(messageFromError(error, label));
    return false;
  }
}
