import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';
import {FetchAllTrainDataUtils, randomDelay, TrainQueryParam} from "./FetchAllTrainDataUtils";
import {getBeiJingDateStr, getDayOfWeek, getNextWeekdayBeijingDateStr} from "./DateUtil";

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 判断日期是否为周末（北京时区）
function isWeekend(dateStr: string): boolean {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6; // 0是周日，6是周六
}

// 创建单日数据文件
async function createSingleDayData(trainDay: string): Promise<string> {
    await randomDelay(1000, 3000); // 每天查询间隔几秒钟

    try {
        const zq = 'ZQA'; // 固定值 肇庆
        const fsx = 'FXA'; // 固定值 佛山西
        const py = 'PYA'; // 固定值 番禺
        const gzlhs = 'GLA'; // 固定值 广州莲花山
        const dgx = 'DXA'; // 固定值 东莞西，后续可能会用到
        const xpx = 'EGQ'; // 固定值 西平西，后续可能会用
        const hd = 'HAA'; // 花都
        const qc = 'QCA'; // 清城
        const byjcb = 'BBA'; // 白云机场北
        const xtn = 'NUQ'; // 新塘南
        const szjc = 'SCA'; // 深圳机场

        // 构造所有站点对的数组
        const stationPairs = [
            {trainDay: trainDay, fromStationCode: fsx, toStationCode: zq},    // [肇庆、佛山西]
            {trainDay: trainDay, fromStationCode: fsx, toStationCode: py},    // [佛山西、番禺]
            {trainDay: trainDay, fromStationCode: py, toStationCode: gzlhs},  // [番禺、广州莲花山]
            {trainDay: trainDay, fromStationCode: py, toStationCode: gzlhs},  // [广州莲花山、小金口]
            {trainDay: trainDay, fromStationCode: qc, toStationCode: hd},     // [清城、花都]
            {trainDay: trainDay, fromStationCode: hd, toStationCode: byjcb},  // [花都、白云机场北]
            {trainDay: trainDay, fromStationCode: xtn, toStationCode: szjc},  // [新塘南、深圳机场]
        ];

        // 自动增加反向
        const getStationPairsWithReverse = (pairs: TrainQueryParam[]): TrainQueryParam[] => {
            const result = [...pairs]; // 先复制原始数组

            // 为每个原始站点对添加反向站点对
            pairs.forEach(pair => {
                result.push({
                    trainDay: pair.trainDay,
                    fromStationCode: pair.toStationCode,
                    toStationCode: pair.fromStationCode
                });
            });

            return result;
        }

        const allStationPairs = getStationPairsWithReverse(stationPairs);
        const trainDetailStr = await FetchAllTrainDataUtils.fetchTrainDetails(allStationPairs, trainDay);

        return trainDetailStr;
    } catch (error) {
        console.error(`Error creating data for ${trainDay}:`, error);
        throw error;
    }
}

/**
 * 说明：
 * 广东城际区分周内图和周末图
 * 用户可以明确购买车票是：
 * 最近4天的数据（今天及未来3天）
 *
 * 更新最新4天数据（如果不含周末，则再追加一个周6）
 * /data/GDCJ/real-time/gdcj-real-time-YYYY-MM-DD.json（每次更新4+1个文件）
 *
 */
async function updateRealTimeData() {

    const realTimeDir = path.join(__dirname, '..', 'data', 'GDCJ', 'real-time');
    if (!fs.existsSync(realTimeDir)) {
        fs.mkdirSync(realTimeDir, {recursive: true});
    }

    const today = getBeiJingDateStr()
    const targetDays = []
    // 检查4天内是否包含周末
    let hasWeekend = false;
    for (let i = 0; i < 4; i++) {
        const currentDate = getBeiJingDateStr(i, today);
        targetDays.push(currentDate)

        const dayOfWeek = getDayOfWeek(currentDate);
        if (dayOfWeek === 6 || dayOfWeek === 7) {
            hasWeekend = true;
            break;
        }
    }
    if (!hasWeekend) {
        const nextSaturday = getNextWeekdayBeijingDateStr(6, today); // 之后的第一个周六
        targetDays.push(nextSaturday)
    }

    console.log('更新实时数据：获取日期为：\n', targetDays.join("、"));

    for (let i = 0; i < targetDays.length; i++) {
        const targetDate = targetDays[i];
        console.log(`开始更新日期 ${targetDate} 的数据`);

        try {
            const trainDataStr = await createSingleDayData(targetDate);

            // 保存实时数据
            const filePath = path.join(realTimeDir, `gdcj-real-time-${targetDate}.json`);
            fs.writeFileSync(filePath, trainDataStr);
            console.log(`Created/Updated real-time file: ${filePath}`);

        } catch (error) {
            console.error(`更新失败，日期: ${targetDate}`, error);
            // 不中断整个流程，继续更新其他日期
        }
    }
}

// 主函数
async function main() {
    try {
        // 更新实时数据并获取最后一个周内和周末数据
        await updateRealTimeData();
        console.log('数据更新完成');
    } catch (error) {
        console.error('主流程执行失败:', error);
        throw error;
    }
}

// 执行主函数
main().catch(console.error);
