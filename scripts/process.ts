import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';
import {FetchAllTrainDataUtils} from "./FetchAllTrainDataUtils";

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
    return date.toISOString().split('T')[0]; // 这里基于传入日期，按天增加，不会产生日期时区问题，如果需要按半天增加，会有问题，但不是本场景需要考虑
}

// 检查文件是否存在
function checkFileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
}

// 创建单日数据文件
async function createSingleDayData(trainDay: string): Promise<void> {
    const dirPath = path.join(__dirname, '..', 'data', 'GDCJ');
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, {recursive: true});
    }

    const filePath = path.join(dirPath, `GDCJ-${trainDay}.json`);

    try {
        const fromStationCode = 'ZQA'; // 固定值 肇庆
        const toStationCode = 'PYA';   // 固定值 番禺

        const apiData = await FetchAllTrainDataUtils.fetchTrainDetails([{
            trainDay: trainDay,
            fromStationCode: fromStationCode,
            toStationCode: toStationCode
        }], trainDay);

        // 写入文件
        fs.writeFileSync(filePath, JSON.stringify(apiData, null, 2));
        console.log(`Created/Updated file: ${filePath}`);
    } catch (error) {
        console.error(`Error creating data for ${trainDay}:`, error);
        throw error;
    }
}

// 初始化策略：创建1-15天的数据
async function initializeData(today: string): Promise<void> {
    console.log('执行初始化策略：创建1-15天的数据');

    for (let i = 0; i < 15; i++) {
        const targetDate = getDateAfterDays(today, i);
        try {
            await createSingleDayData(targetDate);
        } catch (error) {
            console.error(`初始化失败，在第 ${i + 1} 天 (${targetDate}) 处中断`);
            // 不中断整个流程，继续更新其他日期
        }
    }
}

// 每日递增策略：更新第1、2、3天和第14、15天的数据
async function incrementalUpdate(today: string): Promise<void> {
    console.log('执行每日递增策略：更新特定天数的数据');

    // 需要更新的天数：第1、2、3天和第14、15天
    const daysToUpdate = [0, 1, 2, 13, 14]; // 0是今天，1是明天，以此类推

    for (const dayOffset of daysToUpdate) {
        const targetDate = getDateAfterDays(today, dayOffset);
        try {
            await createSingleDayData(targetDate);
        } catch (error) {
            console.error(`更新失败，日期: ${targetDate}`, error);
            // 不中断整个流程，继续更新其他日期
        }
    }
}

// 检查是否需要初始化
async function checkInitializationNeeded(today: string): Promise<boolean> {
    // 检查1-14天的文件是否存在（第15天的数据是最新数据 会每天都刷新）
    for (let i = 0; i < 14; i++) {
        const targetDate = getDateAfterDays(today, i);
        const filePath = path.join(__dirname, '..', 'data', 'GDCJ', `GDCJ-${targetDate}.json`);

        if (!checkFileExists(filePath)) {
            console.log(`检测到缺失文件: GDCJ-${targetDate}.json，需要初始化`);
            return true;
        }
    }

    return false;
}

// 主函数
async function main() {
    const today = getBeijingDate();
    console.log(`当前北京时间: ${today}`);

    try {
        // 检查是否需要初始化
        const needInit = await checkInitializationNeeded(today);

        if (needInit) {
            await initializeData(today);
        } else {
            await incrementalUpdate(today);
        }

        console.log('数据更新完成');
    } catch (error) {
        console.error('主流程执行失败:', error);
        throw error;
    }
}

// 执行主函数
main().catch(console.error);
