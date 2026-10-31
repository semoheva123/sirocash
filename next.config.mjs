/** @type {import('next').NextConfig} */
const config = { poweredByHeader: false,
 serverExternalPackages:['sharp','tesseract.js','tesseract.js-core'],
 outputFileTracingIncludes:{'/api/identity':['./node_modules/tesseract.js/src/**/*','./node_modules/tesseract.js-core/**/*','./node_modules/@tesseract.js-data/eng/4.0.0_best_int/*','./node_modules/@tesseract.js-data/eng/package.json','./node_modules/@tesseract.js-data/ara/4.0.0_best_int/*','./node_modules/@tesseract.js-data/ara/package.json']} };
export default config;
