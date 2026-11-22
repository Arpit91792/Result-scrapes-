const path = require('path');
const { createWorker } = require('tesseract.js');

async function createTrOcrWorker() {
      return createWorker('eng', 1, {
            langPath: path.join(__dirname, '../../../'),
            cachePath: path.join(__dirname, '../../../tessdata'),
            gzip: false,
            logger: () => {},
      });
}

module.exports = { createTrOcrWorker };
