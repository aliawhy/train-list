import {TrainInfo, TrainQueryUtils} from "./TrainQueryUtils";
import {TrainDetail, TrainDetailUtils} from "./TrainDetailUtils";
import {getDayOfWeek} from "../date/DateUtil";
import {getQueryStationPairs, isTest} from "../../processGDCJ";
import {randomDelay} from "../delay/DelayUtil";


export type TrainQueryParam = {
    trainDay: string;
    fromStationCode: string;
    toStationCode: string;
};

export const lastTrainInfoMap: Record<'weekday' | 'weekend', TrainInfo[]> = {
    weekday: [],
    weekend: [],
}

export const lastTrainDetailStrMap: Record<'weekday' | 'weekend', string> = {
    weekday: '',
    weekend: '',
}

export const lastTrainDetailMap: Record<'weekday' | 'weekend', TrainDetail[]> = {
    weekday: [],
    weekend: [],
}

const weekdaySet = new Set<number>([1, 2, 3, 4, 5])


export class FetchAllTrainDataUtils {

    /**
     * 批量查询并返回去重后的车次列表
     * @param queries
     */
    static async batchQueryTrainNumbers(
        queries: TrainQueryParam[]
    ): Promise<TrainInfo[], string[]> {
        const uniqueTrainSet = new Set<string>();
        const trainNumbers: string[] = []; // 车次号
        const trainInfos: TrainInfo[] = []; // 车次号对应车次详情

        let cnt = 1;
        for (const query of queries) {
            if (isTest) {
                cnt++
                if (cnt > 3) {
                    break; // 调试使用，避免需要查很久，请保留
                }
            }

            try {
                // 执行单个查询
                await randomDelay(500, 1000);
                const {trainInfoList} = await TrainQueryUtils.queryTrainInfo(
                    query.trainDay,
                    query.fromStationCode,
                    query.toStationCode
                );

                // 处理查询结果
                for (const train of trainInfoList) {
                    // 判断列车是目标车站编码，因为查询结果可能包含其他同城市的车站
                    if (train.departureCode !== query.fromStationCode || train.arrivalCode !== query.toStationCode) {
                        continue;
                    }

                    // 使用出发车次编码originTrainCode作为去重依据，因为列车在中途可能会改变车次号，只要记录一个即可
                    if (!uniqueTrainSet.has(train.originTrainCode)) {
                        uniqueTrainSet.add(train.originTrainCode);
                        trainNumbers.push(train.trainNumber);
                        trainInfos.push(train)
                    }
                }
            } catch (error) {
                console.error(`查询失败: ${query.trainDay} ${query.fromStationCode} -> ${query.toStationCode}`, error);
            }
        }

        console.debug("车次信息： \n", trainNumbers.join(","));
        console.debug(`车次数量 ${trainNumbers.length}`)
        return {trainInfos, trainNumbers};
    }

    /**
     * 批量查询车次详情并返回Map
     * @param trainNumbers 车次列表
     * @param queryDay 查询日期，格式：YYYYMMDD
     * @returns Map<车次, 车次详情>
     */
    static async batchQueryTrainDetails(
        trainNumbers: string[],
        queryDay: string
    ): Promise<TrainDetail[]> {
        const trainDetails: TrainDetail[] = [];

        // 遍历所有车次
        let cnt = 1
        for (const trainNumber of trainNumbers) {
            if (isTest) {
                cnt++
                if (cnt > 3) {
                    break; // 调试使用，避免需要查很久，请保留
                }
            }

            try {
                // 查询单个车次详情
                const trainDetail = await TrainDetailUtils.queryTrainDetailAndSimpleField(trainNumber, queryDay);

                // 将结果存入Map
                trainDetails.push(trainDetail);
            } catch (error) {
                console.error(`查询车次详情失败: ${trainNumber}${queryDay}`, error);
            }
        }

        console.debug(`车次数量 ${trainNumbers.length}, 详情数量${trainDetails.length}`)
        return trainDetails;
    }

    static async fetchTrainDetails(trainDay: string) {
        const queries = getQueryStationPairs(trainDay);
        const {trainInfos, trainNumbers} = await FetchAllTrainDataUtils.batchQueryTrainNumbers(queries); // 输出的车次已经基于原始车次去重，如G1 G2同车次，输出结果只会有其中一个

        let dayOfWeek = getDayOfWeek(trainDay);
        // 判断是否和上一次查询的周内/周末的车辆数据完全一样
        const cacheType = weekdaySet.has(dayOfWeek) ? 'weekday' : 'weekend';
        const lastTrainInfos: TrainInfo[] = lastTrainInfoMap[cacheType] || []
        const isTrainInfosEqual = checkTrainInfosEqual(trainInfos, lastTrainInfos)

        if (isTrainInfosEqual) {
            console.log(`本次 ${trainDay} ${cacheType} 查询和上次数据一样， 直接返回！`)
            return []
        }

        lastTrainInfoMap[cacheType] = trainInfos
        console.log(`本次 ${trainDay} ${cacheType} 查询和上次数据不一样， 进行车次详情查询！`)
        return await FetchAllTrainDataUtils.batchQueryTrainDetails(trainNumbers, trainDay);
    }
}

function checkTrainInfosEqual(arr1: TrainInfo[], arr2: TrainInfo[]): boolean {
    // 首先检查长度是否相同
    if (!arr1 || !arr2 || arr1.length !== arr2.length) {
        return false;
    }

    // 逐个比较每个元素
    for (let i = 0; i < arr1.length; i++) {
        const train1 = arr1[i];
        const train2 = arr2[i];

        // 检查所有字段是否相等
        if (train1.trainNumber !== train2.trainNumber ||
            train1.departureTime !== train2.departureTime ||
            train1.arrivalTime !== train2.arrivalTime ||
            train1.originTrainCode !== train2.originTrainCode ||
            train1.departureCode !== train2.departureCode ||
            train1.arrivalCode !== train2.arrivalCode) {
            return false;
        }
    }

    // 所有检查都通过，返回true
    return true;
}