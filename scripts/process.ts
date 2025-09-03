import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';
import {TrainQueryUtils} from "./TrainQueryUtils";
import {FetchAllTrainDataUtils} from "./FetchAllTrainDataUtils";

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取北京时间
function getBeijingTime(): { date: string; time: string } {
    const now = new Date();
    // 转换为北京时间 (UTC+8)
    const beijingTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);

    // 格式化为年月日
    const date = beijingTime.toISOString().replace(/[-T:]/g, '').slice(0, 8);
    // 格式化为年月日时分秒
    const time = beijingTime.toISOString().replace(/[-T:]/g, '').slice(0, 14);

    return {date, time};
}

// 创建JSON文件
async function createJsonFile() {
    const {date, time} = getBeijingTime();

    // 确保目录存在
    const dirPath = path.join(__dirname, '..', 'data', date);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, {recursive: true});
    }

    // 创建文件路径
    const filePath = path.join(dirPath, `test-${time}.json`);

    try {
        const trainDay = '2025-09-03'; // 示例值
        const fromStationCode = 'BJP'; // 北京站代码，示例值
        const toStationCode = 'SHH';   // 上海站代码，示例值
        const apiData = await TrainQueryUtils.queryTrainInfo(trainDay, fromStationCode, toStationCode)

        FetchAllTrainDataUtils.fetchTrainDetails([{
            trainDay: trainDay,
            fromStationCode: fromStationCode,
            toStationCode: toStationCode
        }], trainDay)
        // 写入文件
        fs.writeFileSync(filePath, JSON.stringify(apiData, null, 2));
        console.log(`Created file: ${filePath}`);

        return {date, filePath};
    } catch (error) {
        console.error('Error creating JSON file:', error);
        throw error;
    }
}

// 执行主函数
createJsonFile().catch(console.error);
