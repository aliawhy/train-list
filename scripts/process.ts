import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';
import {FetchAllTrainDataUtils, randomDelay, TrainQueryParam} from "./FetchAllTrainDataUtils";

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取北京时间日期 (格式: 2025-05-01)
function getBeijingDate(): string {
    const now = new Date();
    // 转换为北京时间 (UTC+8)
    const beijingTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
    return beijingTime.toISOString().split('T')[0];
}

// 获取指定天数后的日期
function getDateAfterDays(baseDate: string, days: number): string {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

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
 * 更新最新4天数据
 * /data/GDCJ/real-time/gdcj-real-time-YYYY-MM-DD.json（每次更新4个文件）
 *
 * @param today
 */
async function updateRealTimeData(today: string): Promise<{ weekdayData: string | null, weekendData: string | null }> {
    console.log('更新实时数据：获取最近4天的数据');

    const realTimeDir = path.join(__dirname, '..', 'data', 'GDCJ', 'real-time');
    if (!fs.existsSync(realTimeDir)) {
        fs.mkdirSync(realTimeDir, {recursive: true});
    }

    let lastWeekdayData: string | null = null;
    let lastWeekendData: string | null = null;

    // 获取最近4天的数据
    for (let i = 0; i < 4; i++) {
        const targetDate = getDateAfterDays(today, i);
        try {
            const trainDataStr = await createSingleDayData(targetDate);

            // 保存实时数据
            const filePath = path.join(realTimeDir, `gdcj-real-time-${targetDate}.json`);
            fs.writeFileSync(filePath, trainDataStr);
            console.log(`Created/Updated real-time file: ${filePath}`);

            // 记录最后一个周内和周末数据
            if (isWeekend(targetDate)) {
                lastWeekendData = trainDataStr; // 迭代不断覆盖，以实现:取最后一个周末（若存在）
            } else {
                lastWeekdayData = trainDataStr; // 迭代不断覆盖，以实现:取最后一个周内
            }
        } catch (error) {
            console.error(`更新失败，日期: ${targetDate}`, error);
            // 不中断整个流程，继续更新其他日期
        }
    }

    return {weekdayData: lastWeekdayData, weekendData: lastWeekendData};
}

/**
 * 更新周内、周末模板数据：
 * /data/GDCJ/template/gdcj-template-weekday.json
 * /data/GDCJ/template/gdcj-template-weekend.json
 *
 * @param weekdayData
 * @param weekendData
 */
async function updateTemplateData(weekdayData: string | null, weekendData: string | null): Promise<void> {
    console.log('更新模板数据');

    const templateDir = path.join(__dirname, '..', 'data', 'GDCJ', 'template');
    if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, {recursive: true});
    }

    // 更新周内模板
    if (weekdayData) {
        const weekdayFilePath = path.join(templateDir, 'gdcj-template-weekday.json');
        fs.writeFileSync(weekdayFilePath, weekdayData);
        console.log(`Updated weekday template: ${weekdayFilePath}`);
    }

    // 更新周末模板
    if (weekendData) {
        const weekendFilePath = path.join(templateDir, 'gdcj-template-weekend.json');
        fs.writeFileSync(weekendFilePath, weekendData);
        console.log(`Updated weekend template: ${weekendFilePath}`);
    }
}

// 主函数
async function main() {
    const today = getBeijingDate();
    console.log(`当前北京时间: ${today}`);

    try {
        // 更新实时数据并获取最后一个周内和周末数据
        const {weekdayData, weekendData} = await updateRealTimeData(today);

        // 更新模板数据
        await updateTemplateData(weekdayData, weekendData);

        console.log('数据更新完成');
    } catch (error) {
        console.error('主流程执行失败:', error);
        throw error;
    }
}

// 执行主函数
main().catch(console.error);
