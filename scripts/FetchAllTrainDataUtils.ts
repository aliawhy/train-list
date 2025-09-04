import {TrainQueryUtils} from "./TrainQueryUtils";
import {StopTime, TrainDetail, TrainDetailUtils} from "./TrainDetailUtils";

export type TrainQueryParam = {
    trainDay: string;
    fromStationCode: string;
    toStationCode: string;
};

export class FetchAllTrainDataUtils {

    /**
     * 批量查询并返回去重后的车次列表
     * @param queries
     */
    static async batchQueryTrainNumbers(
        queries: TrainQueryParam[]
    ): Promise<string[]> {
        const uniqueTrainSet = new Set<string>();
        const trainNumbers: string[] = [];

        for (const query of queries) {
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
                    }
                }
            } catch (error) {
                console.error(`查询失败: ${query.trainDay} ${query.fromStationCode} -> ${query.toStationCode}`, error);
            }
        }

        console.debug(`车次信息`)
        console.debug(trainNumbers)
        console.debug(`车次数量 ${trainNumbers.length}`)
        return trainNumbers;
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
            try {
                // 查询单个车次详情
                await randomDelay(500, 1000);
                const trainDetail = await TrainDetailUtils.queryTrainDetail(trainNumber, queryDay);

                // 将结果存入Map
                trainDetails.push(trainDetail);

                // cnt++
                // if (cnt > 3) {
                //     break; // 调试使用，避免需要查很久，请保留
                // }
            } catch (error) {
                console.error(`查询车次详情失败: ${trainNumber}${queryDay}`, error);
            }
        }

        console.debug(`车次数量 ${trainNumbers.length}, 详情数量${trainDetails.length}`)
        return trainDetails;
    }

    static async fetchTrainDetails(queries: TrainQueryParam[], queryDay: string) {
        const trainNumbers: string[] = await FetchAllTrainDataUtils.batchQueryTrainNumbers(queries); // 输出的车次已经基于原始车次去重，如G1 G2同车次，输出结果只会有其中一个
        const trainDetails: TrainDetail[] = await FetchAllTrainDataUtils.batchQueryTrainDetails(trainNumbers, queryDay);
        return FetchAllTrainDataUtils.convertTrainDetailsToString(trainDetails, queryDay);
    }

    /**
     * 将TrainDetail数组转换为压缩格式的字符串
     * 格式：#分隔TrainDetail，@分隔StopTime，|分隔字段
     * @param trainDetails 列车详情数组
     * @param queryDay 查询日期，格式，可能带横向 2022-01-02 也可能不带 20220102
     * @returns 压缩后的字符串
     */
    static convertTrainDetailsToString(trainDetails: TrainDetail[], queryDay: string): string {

        // 按照StopTime定义的字段顺序
        const fieldOrder: (keyof StopTime)[] = [
            'stationName',
            'arraiveDate', // 到达此站日期，格式，20220102 不带横线，为了压缩，改成和queryDay的差
            'arriveTime',
            'trainDate',  // 从此站出发日期，格式，20220102 不带横线，为了压缩，改成和queryDay的差
            'startTime',
            'stationTrainCode',
        ];

        queryDay = queryDay.replace(/-/g, ''); // 统一为不带-的格式

        // 将queryDay转换为Date对象用于计算日期差
        const queryDate = new Date(
            parseInt(queryDay.substring(0, 4)),
            parseInt(queryDay.substring(4, 6)) - 1,
            parseInt(queryDay.substring(6, 8))
        );

        return trainDetails.map(trainDetail => {
            // 将每个StopTime转换为字段分隔的字符串
            const stopTimesStr = trainDetail.stopTime.map(stopTime => {
                return fieldOrder.map(field => {
                    let value = stopTime[field];

                    // 对日期字段进行压缩处理
                    if (field === 'arraiveDate' || field === 'trainDate') {
                        const dateStr = value as string;
                        if (dateStr) {
                            const date = new Date(
                                parseInt(dateStr.substring(0, 4)),
                                parseInt(dateStr.substring(4, 6)) - 1,
                                parseInt(dateStr.substring(6, 8))
                            );

                            // 计算日期差（天数）
                            const timeDiff = date.getTime() - queryDate.getTime();
                            const dayDiff = Math.floor(timeDiff / (1000 * 3600 * 24));

                            // 根据规则转换：0为空字符串，负数为-x，正数为x
                            if (dayDiff === 0) {
                                value = '';
                            } else {
                                value = `${dayDiff}`;
                            }
                        }
                    }

                    return value;
                }).join('|');
            }).join('@');

            return stopTimesStr;
        }).join('#');
    }

}

/**
 * 随机延时函数
 * @param minDelay 最小延时（毫秒）
 * @param maxDelay 最大延时（毫秒）
 */
export async function randomDelay(minDelay: number, maxDelay: number): Promise<void> {
    // 计算随机延时时间
    const delay = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
    // 等待随机时间
    await new Promise(resolve => setTimeout(resolve, delay));
}
