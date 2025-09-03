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
        const result: string[] = [];

        for (const query of queries) {
            try {
                // 执行单个查询
                await new Promise(resolve => setTimeout(resolve, 350)); // 延时一些时间，避免queryTrainInfo压力
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
                        result.push(train.trainNumber);
                    }
                }
            } catch (error) {
                console.error(`查询失败: ${query.trainDay} ${query.fromStationCode} -> ${query.toStationCode}`, error);
            }
        }

        console.debug('trainNumbers')
        console.debug(result)
        return result;
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
                await new Promise(resolve => setTimeout(resolve, 350)); // 延时一些时间
                const trainDetail = await TrainDetailUtils.queryTrainDetail(trainNumber, queryDay);

                // 将结果存入Map
                trainDetails.push(trainDetail);

                cnt++
                if (cnt > 3) {
                    break; // 调试使用，避免需要查很久
                }
            } catch (error) {
                console.error(`查询车次详情失败: ${trainNumber}${queryDay}`, error);
            }
        }

        console.debug('trainDetails')
        console.debug(trainDetails)
        return trainDetails;
    }

    static async fetchTrainDetails(queries: TrainQueryParam[], queryDay: string) {
        const trainNumbers: string[] = await FetchAllTrainDataUtils.batchQueryTrainNumbers(queries); // 输出的车次已经基于原始车次去重，如G1 G2同车次，输出结果只会有其中一个
        const trainDetails: TrainDetail[] = await FetchAllTrainDataUtils.batchQueryTrainDetails(trainNumbers, queryDay);
        return FetchAllTrainDataUtils.convertTrainDetailsToString(trainDetails);
    }

    /**
     * 将TrainDetail数组转换为压缩格式的字符串
     * 格式：#分隔TrainDetail，@分隔StopTime，|分隔字段
     * @param trainDetails 列车详情数组
     * @returns 压缩后的字符串
     */
    static convertTrainDetailsToString(trainDetails: TrainDetail[]): string {
        // 按照StopTime定义的字段顺序
        const fieldOrder: (keyof StopTime)[] = [
            'stationName',
            'arraiveDate',
            'arriveTime',
            'trainDate',
            'startTime',
            'stationTrainCode',
        ];

        return trainDetails.map(trainDetail => {
            // 将每个StopTime转换为字段分隔的字符串
            const stopTimesStr = trainDetail.stopTime.map(stopTime => {
                return fieldOrder.map(field => stopTime[field]).join('|');
            }).join('@');

            return stopTimesStr;
        }).join('#');
    }
}

