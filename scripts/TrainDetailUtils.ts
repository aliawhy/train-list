import fetch from 'node-fetch';

export interface StopTime {
    // 停靠站
    stationName: string; // 停靠车站
    arraiveDate: string; // 到达日期，年月日，不带连接符，如20220201
    arriveTime: string; // 到达时间，4位数时分，1420，（表示14点20分）
    trainDate: string; // 发车日期，年月日，不带连接符，如20220201
    startTime: string; // 发车时间，4位数时分，1420，（表示14点20分）
    startTrainDate: string; // 始发日期。 trainDate 是车站发车日期，可能和始发日期不是同一天
    stationTrainCode: string; // 停靠车站的车次号
    stationNo: string; // 车站序号，这趟列车的第几个车站
    stationTelecode: string; // 车站code（针对车趟车的）
    lat: string; // 车站纬度
    lon: string; // 车站精度

    // 始发站
    start_station_name: string;
    start_station_telecode: string;
    startTrainCode: string;
}

// 列车详情接口
export interface TrainDetail {
    stopTime: StopTime[];
}

/**
 * 列车车次详情查询工具类
 */
export class TrainDetailUtils {
    /**
     * 获取列车数据
     * @param trainCode 车次号
     * @param startDay 出发日期，格式：YYYYMMDD
     */
    private static async fetchTrainData(trainCode: string, startDay: string): Promise<any> {
        const baseUrl = process.env.API_D;

        if (!baseUrl) {
            throw new Error('API_D environment variable is not set');
        }

        const url = `${baseUrl}?trainCode=${trainCode}&startDay=${startDay}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 打印原始响应文本
        const responseText = await response.text();
        console.debug('原始接口返回:', responseText);

        try {
            return JSON.parse(responseText);
        } catch (e) {
            console.error('JSON解析失败:', e);
        }

        return {};
    }

    /**
     * 查询列车车次详情
     * @param trainCode 车次号
     * @param startDay 出发日期，格式：YYYYMMDD
     */
    public static async queryTrainDetail(trainCode: string, startDay: string): Promise<TrainDetail> {
        try {
            startDay = startDay.replace(/-/g, ''); // 转换为需要的格式

            const data = await TrainDetailUtils.fetchTrainData(trainCode, startDay);
            const result: TrainDetail = data?.data?.trainDetail || {} as TrainDetail;
            result.stopTime = result.stopTime || [];

            for (let i = 0; i < result.stopTime.length; i++) {
                const stopTime = result.stopTime[i] || {} as StopTime;

                // 只保留 StopTime 接口中定义的字段
                result.stopTime[i] = {
                    // 停靠站
                    stationName: stopTime.stationName?.replace(/\s+/g, '') || '',
                    arraiveDate: stopTime.arraiveDate || '',
                    arriveTime: stopTime.arriveTime || '',
                    trainDate: stopTime.trainDate || '',
                    startTime: stopTime.startTime || '',
                    startTrainDate: stopTime.startTrainDate || '',
                    stationTrainCode: stopTime.stationTrainCode || '',
                    stationNo: stopTime.stationNo || '',
                    stationTelecode: stopTime.stationTelecode || '',
                    lat: stopTime.lat || '',
                    lon: stopTime.lon || '',

                    // 始发站
                    start_station_name: stopTime.start_station_name?.replace(/\s+/g, '') || '',
                    start_station_telecode: stopTime.start_station_telecode || '',
                    startTrainCode: stopTime.startTrainCode || '',

                } as StopTime
            }

            return result;
        } catch (error) {
            console.error('Error in queryTrainDetail:', error);
            throw error;
        }
    }
}
