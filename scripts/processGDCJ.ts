import * as path from 'path';
import {fileURLToPath} from 'url';
import {FetchAllTrainDataUtils, TrainQueryParam} from "./utils/fetch/FetchAllTrainDataUtils";
import {getBeiJingDateStr, getDayOfWeek, getNextWeekdayBeijingDateStr} from "./utils/date/DateUtil";
import {TrainDetail} from "./utils/fetch/TrainDetailUtils";
import {randomDelay} from "./utils/delay/DelayUtil";
import {encodeAndSave} from "./utils/file/FileUtils";
import {HistoryResultUtil} from "./utils/history/HistoryResultUtil";

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
    const 肇庆 = 'ZQA'; // 固定值 肇庆
    const 佛山西 = 'FXA'; // 固定值 佛山西
    const 番禺 = 'PYA'; // 固定值 番禺
    const 广州莲花山 = 'GLA'; // 固定值 广州莲花山
    const 小金口 = 'NKQ'; // 固定值 小金口
    const 东莞西 = 'DXA'; // 固定值 东莞西，后续可能会用到
    const 西平西 = 'EGQ'; // 固定值 西平西，后续可能会用
    const 花都 = 'HAA'; // 花都
    const 清城 = 'QCA'; // 清城
    const 白云机场北 = 'BBA'; // 白云机场北
    const 新塘南 = 'NUQ'; // 新塘南
    const 深圳机场 = 'SCA'; // 深圳机场
    const 常平东 = 'FQQ'; // 常平东
    const 陈江南 = 'KKQ'; // 陈江南

    const 飞霞 = 'FEA'; // 飞霞
    const 琶洲 = 'PTQ'; // 琶洲
    const 惠州北 = 'KBA'; // 惠州北

    // 构造所有站点对的数组
    const stationPairs = [
        // // 广清
        // {trainDay: trainDay, fromStationCode: 花都, toStationCode: 清城},
        //
        //
        // // 广州东环
        // {trainDay: trainDay, fromStationCode: 花都, toStationCode: 白云机场北},
        // {trainDay: trainDay, fromStationCode: 花都, toStationCode: 竹料},
        // {trainDay: trainDay, fromStationCode: 花都, toStationCode: 琶洲},
        // {trainDay: trainDay, fromStationCode: 花都, toStationCode: 番禺},
        // {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 琶洲},
        // {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 竹料},
        // {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 白云机场北},
        // {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 花都},
        //
        // // 琶莲
        // {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 广州莲花山},
        // {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 东莞西},
        // {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 西平西},
        // {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 常平东},
        //
        //
        // // 广肇
        // {trainDay: trainDay, fromStationCode: 肇庆, toStationCode: 佛山西},
        // {trainDay: trainDay, fromStationCode: 佛山西, toStationCode: 番禺},
        //
        // // 广惠
        // {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 广州长隆},
        // {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 广州莲花山},
        // {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 东莞西},
        // {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 西平西},
        // {trainDay: trainDay, fromStationCode: 广州莲花山, toStationCode: 西平西},
        // {trainDay: trainDay, fromStationCode: 东莞西, toStationCode: 西平西},
        // {trainDay: trainDay, fromStationCode: 西平西, toStationCode: 常平东},
        // {trainDay: trainDay, fromStationCode: 西平西, toStationCode: 陈江南},
        // {trainDay: trainDay, fromStationCode: 西平西, toStationCode: 云山},
        // {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 惠州北},
        //
        // // 穗深
        // {trainDay: trainDay, fromStationCode: 新塘南, toStationCode: 深圳机场},


        {trainDay: trainDay, fromStationCode: 肇庆, toStationCode: 佛山西},    // [肇庆、佛山西]
        {trainDay: trainDay, fromStationCode: 佛山西, toStationCode: 番禺},    // [佛山西、番禺]
        {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 广州莲花山},  // [番禺、广州莲花山]
        {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 东莞西},  // [番禺、东莞西]
        {trainDay: trainDay, fromStationCode: 广州莲花山, toStationCode: 小金口},  // [广州莲花山、小金口]
        {trainDay: trainDay, fromStationCode: 清城, toStationCode: 花都},     // [清城、花都]
        {trainDay: trainDay, fromStationCode: 花都, toStationCode: 白云机场北},  // [花都、白云机场北]
        {trainDay: trainDay, fromStationCode: 新塘南, toStationCode: 深圳机场},  // [新塘南、深圳机场]

        {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 惠州北},  // [番禺、惠州北]
        {trainDay: trainDay, fromStationCode: 番禺, toStationCode: 惠州北},  // [番禺、佛山西]

        {trainDay: trainDay, fromStationCode: 花都, toStationCode: 琶洲},  // [花都、琶洲]
        {trainDay: trainDay, fromStationCode: 花都, toStationCode: 番禺},  // [花都、番禺]
        {trainDay: trainDay, fromStationCode: 花都, toStationCode: 佛山西},  // [花都、佛山西]
        {trainDay: trainDay, fromStationCode: 花都, toStationCode: 肇庆},  // [花都、肇庆]
        {trainDay: trainDay, fromStationCode: 花都, toStationCode: 东莞西},  // [花都、东莞西]
        {trainDay: trainDay, fromStationCode: 花都, toStationCode: 惠州北},  // [花都、惠州北]
        {trainDay: trainDay, fromStationCode: 花都, toStationCode: 小金口},  // [花都、小金口]

        {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 番禺},  // [琶洲、番禺]
        {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 佛山西},  // [琶洲、佛山西]
        {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 白云机场北},  // [琶洲、白云机场北]
        {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 肇庆},  // [琶洲、肇庆]
        {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 广州莲花山},  // [琶洲、广州莲花山]
        {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 东莞西},  // [琶洲、东莞西]
        {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 惠州北},  // [琶洲、惠州北]
        {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 小金口},  // [琶洲、小金口]
        {trainDay: trainDay, fromStationCode: 琶洲, toStationCode: 飞霞},  // [琶洲、飞霞]

        {trainDay: trainDay, fromStationCode: 东莞西, toStationCode: 常平东},  // [东莞西、常平东]
        {trainDay: trainDay, fromStationCode: 常平东, toStationCode: 陈江南},  // [常平东、陈江南]
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
 * 强制采集范围天数配置
 * 默认为 -1：使用智能策略（4天滚动 + 周末查漏补缺）
 * 设置为 > 0 的整数（如 7）：强制采集未来 N 天（用于应对临时调图/全量覆盖）
 *
 * 注意：修改此值后需重启服务或热更新配置生效
 */

const FORCE_QUERY_RANGE_DAYS = 4; // 注： 也请检查 保存指定日期的值 PROTECTED_HISTORY_DATES 是否是特殊值

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


    // [模式一] 强制指定天数模式
    // 场景：应对临时调图或需要全量数据刷新时
    if (FORCE_QUERY_RANGE_DAYS > 0) {
        for (let i = 0; i < FORCE_QUERY_RANGE_DAYS; i++) {
            targetDays.push(getBeiJingDateStr(i, today));
        }
        console.log(`[强制模式] 采集未来 ${FORCE_QUERY_RANGE_DAYS} 天数据:`, targetDays.join("、"));
        return targetDays;
    }

    // [模式二] 默认智能策略模式
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

        if (HistoryResultUtil.isProtectedDateFromHistory(trainDay)) {
            console.log(`日期 ${trainDay} 在保护列表中，尝试加载历史数据...`);

            const historyDetails = HistoryResultUtil.getHistoryTrainDetails(trainDay);

            // 关键判断：只有不是 undefined 时才认为是有效历史数据
            if (historyDetails !== undefined) {
                finalTrainDetailMap[trainDay] = historyDetails; // 这里可能是 []，这没问题
                console.log(`增加日期 ${trainDay} 数据到记录. 【使用缓存】`);

            } else {
                // 打一个warn日志即可。当天没缓存是正常的，因为滚动查询时， 并非所有天都查。
                // 这时候 这种天如果要保护 等价于不填任何内容（让消费端自己去匹配最近的一天）
                console.warn(`日期 ${trainDay} 被配置为保护日期，但历史文件中缺失该数据，将跳过写入。`);
            }

            continue;
        }

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
 * key： 日期
 * val： 这天的列车
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
        await HistoryResultUtil.initialize(__dirname);
    } catch (err) {
        console.error(`初始化历史数据失败`)
    }
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
