import type {ChainHttpFailure} from './chain-http';
/** Explicit safe codes only: never expose provider text, URLs, keys or arbitrary exceptions. */
const safeCodes=new Set(['RPC_HTTP_FAILURE','RPC_RATE_LIMITED','RPC_CONTENT_TYPE_INVALID','RPC_RESPONSE_TOO_LARGE','RPC_EMPTY_RESPONSE','RPC_TIMEOUT','RPC_INVALID_JSON','RPC_INVALID_ENVELOPE','RPC_TRANSPORT_FAILURE','RPC_LOG_WRONG_CHAIN','RPC_LOG_HEIGHT_INVALID','RPC_LOG_PROVIDER_LAG','RPC_LOG_CHAIN_MISMATCH','SCAN_WRONG_CHAIN','SCAN_INVALID_FINALITY','SCAN_INVALID_HEIGHT','SCAN_INVALID_HASH','SCAN_INVALID_OBJECT','CHAIN_HTTP_FAILED','SCAN_BLOCK_MISMATCH','SCAN_INCOMPLETE_RECEIPTS','SCAN_RECEIPT_CONTEXT','SCAN_LOG_CONTEXT','SCAN_BLOCK_LIMIT','SCAN_LOG_LIMIT','SCAN_BULK_RECEIPTS_UNAVAILABLE','SCAN_ADDRESS_CAPACITY','SCAN_ABORTED','SCAN_LEASE_LOST','SCAN_ASSIGNMENTS_CHANGED','CHAIN_REORG','DEPOSIT_EVIDENCE_CONFLICT']);
export function depositMonitorFailureCode(error:unknown){return error instanceof Error&&safeCodes.has(error.message)?error.message:'SCAN_FAILED'}

/** Fixed transport categories only; never include provider messages, URLs or bodies. */
export function depositTronHttpFailureCode(failure:ChainHttpFailure):string{
 if(failure.reason==='HTTP'){
  if(failure.httpStatus===429)return 'CHAIN_HTTP_429';
  if(failure.httpStatus===401)return 'CHAIN_HTTP_401';
  if(failure.httpStatus===403)return 'CHAIN_HTTP_403';
  if(failure.httpStatus!==undefined&&failure.httpStatus>=500&&failure.httpStatus<=599)return 'CHAIN_HTTP_5XX';
  return 'CHAIN_HTTP_OTHER_STATUS';
 }
 const codes={CONTENT_TYPE:'CHAIN_HTTP_CONTENT_TYPE',BODY_LIMIT:'CHAIN_HTTP_BODY_LIMIT',TIMEOUT_OR_ABORT:'CHAIN_HTTP_TIMEOUT_OR_ABORT',INVALID_JSON:'CHAIN_HTTP_INVALID_JSON',TRANSPORT:'CHAIN_HTTP_TRANSPORT'};
 return codes[failure.reason]??'CHAIN_HTTP_FAILED';
}
