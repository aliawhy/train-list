import * as path from 'path';
import {fileURLToPath} from 'url';
import {FetchAllTrainDataUtils, TrainQueryParam} from "./utils/fetch/FetchAllTrainDataUtils";
import {getBeiJingDateStr, getDayOfWeek, getNextWeekdayBeijingDateStr} from "./utils/date/DateUtil";
import {TrainDetail} from "./utils/fetch/TrainDetailUtils";
import {randomDelay} from "./utils/delay/DelayUtil";
import {encodeAndSave} from "./utils/file/FileUtils";

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 获取要查的车站对
 * 注：为什么不查某车站的全部列车，然后过滤？
 * 答：因为查询某车站的车次，的接口不是实时数据，会有老旧，因此按站站查，站站车查询的接口数据是最新的
 * @param trainDay
 */
export function getQueryStationPairs(trainDay: string) {
    const zq = 'ZQA'; // 固定值 肇庆
    const fsx = 'FXA'; // 固定值 佛山西
    const py = 'PYA'; // 固定值 番禺
    const gzlhs = 'GLA'; // 固定值 广州莲花山
    const xjk = 'NKQ'; // 固定值 小金口
    const dgx = 'DXA'; // 固定值 东莞西，后续可能会用到
    const xpx = 'EGQ'; // 固定值 西平西，后续可能会用
    const hd = 'HAA'; // 花都
    const qc = 'QCA'; // 清城
    const byjcb = 'BBA'; // 白云机场北
    const xtn = 'NUQ'; // 新塘南
    const szjc = 'SCA'; // 深圳机场

    const feixia = 'FEA'; // 飞霞
    const pazhou = 'PTQ'; // 琶洲
    const huizhoubei = 'HUA'; // 惠州北

    // 构造所有站点对的数组
    const stationPairs = [
        {trainDay: trainDay, fromStationCode: zq, toStationCode: fsx},    // [肇庆、佛山西]
        {trainDay: trainDay, fromStationCode: fsx, toStationCode: py},    // [佛山西、番禺]
        {trainDay: trainDay, fromStationCode: py, toStationCode: gzlhs},  // [番禺、广州莲花山]
        {trainDay: trainDay, fromStationCode: gzlhs, toStationCode: xjk},  // [广州莲花山、小金口]
        {trainDay: trainDay, fromStationCode: qc, toStationCode: hd},     // [清城、花都]
        {trainDay: trainDay, fromStationCode: hd, toStationCode: byjcb},  // [花都、白云机场北]
        {trainDay: trainDay, fromStationCode: xtn, toStationCode: szjc},  // [新塘南、深圳机场]


        {trainDay: trainDay, fromStationCode: hd, toStationCode: pazhou},  // [花都、琶洲]
        {trainDay: trainDay, fromStationCode: hd, toStationCode: py},  // [花都、番禺]
        {trainDay: trainDay, fromStationCode: hd, toStationCode: fsx},  // [花都、佛山西]
        {trainDay: trainDay, fromStationCode: hd, toStationCode: zq},  // [花都、肇庆]
        {trainDay: trainDay, fromStationCode: hd, toStationCode: dgx},  // [花都、东莞西]
        {trainDay: trainDay, fromStationCode: hd, toStationCode: huizhoubei},  // [花都、惠州北]

        {trainDay: trainDay, fromStationCode: pazhou, toStationCode: py},  // [琶洲、番禺]
        {trainDay: trainDay, fromStationCode: pazhou, toStationCode: fsx},  // [琶洲、佛山西]
        {trainDay: trainDay, fromStationCode: pazhou, toStationCode: zq},  // [琶洲、肇庆]
        {trainDay: trainDay, fromStationCode: pazhou, toStationCode: dgx},  // [琶洲、东莞西]
        {trainDay: trainDay, fromStationCode: pazhou, toStationCode: huizhoubei},  // [琶洲、惠州北]
        {trainDay: trainDay, fromStationCode: pazhou, toStationCode: feixia},  // [琶洲、飞霞]
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

    return getStationPairsWithReverse(stationPairs);
}


/**
 * 说明：
 * 广东城际区分周内图和周末图
 * 用户可以明确购买车票是：
 * 最近4天的数据（今天及未来3天）
 *
 * 因此：
 * 取最近4天的数据，如果最近4天不含周末，再追加一个周六的数据
 */
function getQueryDays() {
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
        }
    }
    if (!hasWeekend) {
        const nextSaturday = getNextWeekdayBeijingDateStr(6, today); // 之后的第一个周六
        targetDays.push(nextSaturday)
    }

    console.log('更新实时数据：获取日期为：\n', targetDays.join("、"));
    return targetDays;
}

/**
 * key： 日期
 * val： 这天的列车
 *
 * 注： 每次查4天+周六。
 * 如果周内数据都一样， 会只有第一个周内的数据
 * 如果周末数据都一样， 会只有第一个周末的数据
 *
 * 比如 周3456，  其中345一样， 那么
 * {
 *      2025-09-03: [xxx],
 *      2025-09-06: [xxx],
 * }
 * 其他相同数据就不存储了， 消费端那边有对应代码来解析缺少的日期
 * 这里为了减少文件大小，使网络下载加速
 */

async function getTrainDetailsForQueryDays() {
    const queryDays = getQueryDays();
    const finalTrainDetailMap: Record<string, TrainDetail[]> = {}

    for (let i = 0; i < queryDays.length; i++) {
        const trainDay = queryDays[i];
        console.log(`开始更新日期 ${trainDay} 的数据`);

        try {
            await randomDelay(1000, 3000); // 每天查询间隔几秒钟
            const trainDetails = await FetchAllTrainDataUtils.fetchTrainDetails(trainDay);

            if (Array.isArray(trainDetails) && trainDetails.length > 0) {
                finalTrainDetailMap[trainDay] = trainDetails
                console.log(`增加日期 ${trainDay} 数据到记录.`);
            }
        } catch (error) {
            console.error(`更新失败，日期: ${trainDay}`, error);
            // 不中断整个流程，继续更新其他日期
        }
    }
    return finalTrainDetailMap
}

/**
 *
 * 每天一个文件
 * /data/GDCJ/gdcj-YYYY-MM-DD.msgpack.gz（每天一个文件）
 */
export type TrainDetailMap = Record<string, TrainDetail[]>

async function updateRealTimeData() {

    const result: TrainDetailMap = await getTrainDetailsForQueryDays();
    const resulDays = Object.keys(result);
    console.debug(`查询完毕，共${resulDays.length}天的数据。 ${resulDays.join(",")}`)

    await encodeAndSave(__dirname, result)
}


// 主函数
export const isTest = false // 测试时 只下载少量车

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
