import {encode as msgpackEncoder} from 'msgpack-lite';
import pako from 'pako';
import {logTime} from "../log/LogUtils";
import path from "path";
import fs from "fs";
import {getBeiJingDateStr} from "../date/DateUtil";
import {TrainDetailMap} from "../../processGDCJ";

/**
 * 压缩和编码，然后保存
 * 每天一个文件
 * /data/GDCJ/gdcj-YYYY-MM-DD.msgpack.gz（每天一个文件）
 */
export function encodeAndSave(__dirname, result: TrainDetailMap) {
    const fileDir = path.join(__dirname, '..', 'data', 'gdcj-train-detail'); // 当前在script目录，要..到data目录
    const fileName = `gdcj-${getBeiJingDateStr()}.msgpack.gz`;

    if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, {recursive: true});
    }

    // 使用msgpack编码
    const encodedData = msgpackEncoder(result);
    console.debug(`${logTime()} 数据保存：pack编码完毕`);

    // 压缩为gz
    const compressedData = pako.gzip(encodedData);
    console.debug(`${logTime()} 数据保存：gz压缩完毕`);

    // 写入文件
    const filePath = path.join(fileDir, fileName);
    fs.writeFileSync(filePath, compressedData);
    console.debug(`${logTime()} 数据保存：文件写入完毕，文件名=${fileName}, 路径=${filePath}`);
}
