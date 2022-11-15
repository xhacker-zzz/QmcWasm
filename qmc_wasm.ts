import QmcCryptoModule from '@/QmcWasm/QmcWasmBundle';
import { MergeUint8Array } from '@/utils/MergeUint8Array';

// 每次处理 2M 的数据
const DECRYPTION_BUF_SIZE = 1024 * 1024;

export interface QMC2DecryptionResult {
  success: boolean;
  data: Uint8Array;
  songId: string | number;
  error: string;
}

/**
 * 解密一个 QMC2 加密的文件。
 *
 * 如果检测并解密成功，返回解密后的 Uint8Array 数据。
 * @param  {ArrayBuffer} qmcBlob 读入的文件 Blob
 */
export async function DecryptQmcWasm(qmcBlob: ArrayBuffer, ext: string): Promise<QMC2DecryptionResult> {
  const result: QMC2DecryptionResult = { success: false, data: new Uint8Array(), songId: 0, error: '' };

  // 初始化模组
  let QmcCrypto: any;

  try {
    QmcCrypto = await QmcCryptoModule();
  } catch (err: any) {
    result.error = err?.message || 'wasm 加载失败';
    return result;
  }
  if (!QmcCrypto) {
    result.error = 'wasm 加载失败';
    return result;
  }

  // 申请内存块，并文件末端数据到 WASM 的内存堆
  const qmcBuf = new Uint8Array(qmcBlob);
  const pQmcBuf = QmcCrypto._malloc(DECRYPTION_BUF_SIZE);
  QmcCrypto.writeArrayToMemory(qmcBuf.slice(-DECRYPTION_BUF_SIZE), pQmcBuf);

  // 进行解密初始化
  console.log('start dec prepare');
  const tailSize = QmcCrypto.preDec(pQmcBuf, qmcBuf.length, ext)
  if (tailSize == -1) {
    result.error = QmcCrypto.getError();
    console.log('dec error');
    return result;
  } else {
    result.songId = QmcCrypto.getSongId();
    console.log('prepare success');
  }

  const decryptedParts = [];
  let offset = 0;
  let bytesToDecrypt = qmcBuf.length - tailSize;
  while (bytesToDecrypt > 0) {
    const blockSize = Math.min(bytesToDecrypt, DECRYPTION_BUF_SIZE);

    // 解密一些片段
    const blockData = new Uint8Array(qmcBuf.slice(offset, offset + blockSize));
    QmcCrypto.writeArrayToMemory(blockData, pQmcBuf);
    decryptedParts.push(QmcCrypto.HEAPU8.slice(pQmcBuf, pQmcBuf + QmcCrypto.decBlob(pQmcBuf, blockSize, offset)));

    offset += blockSize;
    bytesToDecrypt -= blockSize;
  }
  console.log('dec success');
  QmcCrypto._free(pQmcBuf);

  result.data = MergeUint8Array(decryptedParts);
  result.success = true;

  return result;
}
