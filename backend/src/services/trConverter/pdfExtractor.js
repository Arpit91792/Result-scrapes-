const fs = require('fs');
const { createTrOcrWorker } = require('./ocrService');

let pdfjsPromise;
let canvasApi;
const ENROLLMENT_PATTERN = /\b\d{4}[A-Z]{2,6}\d{2,3}(?:[A-Z]\d{1,4}|\d{2,6})\b/i;

function getCanvasApi() {
      if (!canvasApi) canvasApi = require('@napi-rs/canvas');
      return canvasApi;
}

async function loadPdfJs() {
      if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
      return pdfjsPromise;
}

function extractTextLines(items) {
      const lines = [];
      for (const item of items) {
            if (!item.str || !item.str.trim()) continue;
            const y = item.transform[5];
            let line = lines.find(candidate => Math.abs(candidate.y - y) <= 4.5);
            if (!line) {
                  line = { y, items: [] };
                  lines.push(line);
            }
            line.items.push({ x: item.transform[4], text: item.str });
      }
      return lines
            .sort((a, b) => b.y - a.y)
            .map(line => line.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').trim())
            .filter(Boolean)
            .join('\n');
}

async function renderPageForOcr(page, worker) {
      const { createCanvas } = getCanvasApi();
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      try {
            await page.render({ canvasContext: context, viewport }).promise;
            const image = canvas.toBuffer('image/png');
            const result = await worker.recognize(image);
            return { text: result.data.text || '', confidence: Number(result.data.confidence) || 0 };
      } finally {
            canvas.width = 0;
            canvas.height = 0;
      }
}

async function extractPdfPages(filePath, onPage) {
      const pdfjs = await loadPdfJs();
      const data = await fs.promises.readFile(filePath);
      const document = await pdfjs.getDocument({
            data: new Uint8Array(data),
            useSystemFonts: true,
            isEvalSupported: false,
      }).promise;
      let worker = null;
      let processedPages = 0;
      let failedPages = 0;

      try {
            for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
                  let page;
                  try {
                        page = await document.getPage(pageNumber);
                        const textContent = await page.getTextContent();
                        let text = extractTextLines(textContent.items);
                        let confidence = 100;
                        let usedOcr = false;

                        const hasUsableEmbeddedText = text.replace(/\s/g, '').length >= 80
                              && ENROLLMENT_PATTERN.test(text);
                        if (!hasUsableEmbeddedText) {
                              const { DOMMatrix, ImageData, Path2D } = getCanvasApi();
                              if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
                              if (!globalThis.ImageData) globalThis.ImageData = ImageData;
                              if (!globalThis.Path2D) globalThis.Path2D = Path2D;
                              if (!worker) worker = await createTrOcrWorker();
                              const ocrResult = await renderPageForOcr(page, worker);
                              text = ocrResult.text;
                              confidence = ocrResult.confidence;
                              usedOcr = true;
                        }

                        await onPage({
                              pageNumber,
                              pageCount: document.numPages,
                              text,
                              confidence,
                              usedOcr,
                        });
                        processedPages++;
                  } catch (error) {
                        failedPages++;
                        await onPage({
                              pageNumber,
                              pageCount: document.numPages,
                              text: '',
                              confidence: 0,
                              usedOcr: false,
                              error: error.message,
                        });
                  } finally {
                        if (page) page.cleanup();
                  }
            }
            return { pageCount: document.numPages, processedPages, failedPages };
      } finally {
            if (worker) await worker.terminate();
            await document.destroy();
      }
}

module.exports = { extractPdfPages };
