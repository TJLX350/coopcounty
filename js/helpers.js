(() => {
  "use strict";

  const Helpers = {
    escapeHtml(value = "") {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    },

    uuid() {
      if (crypto?.randomUUID) return crypto.randomUUID();
      return `cc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    },

    todayKey(date = new Date()) {
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 10);
    },

    niceDate(dateKey, options = {}) {
      const date = new Date(`${dateKey}T12:00:00`);
      return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        ...options
      });
    },

    download(content, filename, mimeType = "application/octet-stream") {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    fileToDataUrl(file, maxWidth = 1400, quality = 0.82) {
      return new Promise((resolve, reject) => {
        if (!file?.type?.startsWith("image/")) {
          reject(new Error("Please choose an image file."));
          return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("The photo could not be read."));
        reader.onload = () => {
          const image = new Image();
          image.onerror = () => reject(new Error("The photo could not be opened."));
          image.onload = () => {
            const scale = Math.min(1, maxWidth / image.width);
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", quality));
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    debounce(fn, delay = 250) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    }
  };

  window.Helpers = Object.freeze(Helpers);
})();
