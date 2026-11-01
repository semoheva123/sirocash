import sharp from 'sharp';
import {createWorker,OEM} from 'tesseract.js';
import {copyFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DOCUMENT_LIMIT} from './identity';
export async function normalizeIdentityImage(input:Buffer){
 if(input.length>DOCUMENT_LIMIT||input.length<100)throw Error('image');
 const image=sharp(input,{limitInputPixels:12000000,animated:false,failOn:'warning'});
 const metadata=await image.metadata();
 if(!['jpeg','png'].includes(metadata.format||'')||(metadata.pages||1)!==1||!metadata.width||!metadata.height||Math.min(metadata.width,metadata.height)<600)throw Error('image');
 const {data,info}=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:88}).toBuffer({resolveWithObject:true});
 if(data.length>DOCUMENT_LIMIT)throw Error('image');
 const stats=await sharp(data).greyscale().stats();
 // A coarse contrast warning only, not a forgery or liveness detector.
 const contrast=Math.round(stats.channels[0].stdev*10)/10;
 return {data,checks:{width:info.width,height:info.height,contrast}};
}
export async function identityOcr(images:Buffer[]){
 // Language models are public package assets, not identity data. No CDN downloads.
 const models=await mkdtemp(path.join(tmpdir(),'siro-ocr-models-'));
 let worker:Awaited<ReturnType<typeof createWorker>>;
 try{
  await Promise.all(['eng','ara'].map(code=>copyFile(path.join(path.join(process.cwd(),'node_modules/@tesseract.js-data',code),'4.0.0_best_int',code+'.traineddata.gz'),path.join(models,code+'.traineddata.gz'))));
  worker=await createWorker(['eng','ara'],OEM.LSTM_ONLY,{langPath:models,workerPath:path.join(process.cwd(),'node_modules/tesseract.js/src/worker-script/node/index.js'),cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{}});
 }finally{await rm(models,{recursive:true,force:true})}
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([
   (async()=>{const results=[];for(const image of images){const {data}=await worker.recognize(image);results.push({status:'completed' as const,confidence:Math.round(data.confidence),characters:data.text.replace(/\s/g,'').length})}return results})(),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),25000)})
  ]);
 }finally{clearTimeout(timer);await worker.terminate()}
}
