import fetch from 'node-fetch';

export interface StopTime {
    // 停靠站
    stationName: string; // 停靠车站
    arraiveDate: string; // 到达日期，年月日，不带连接符，如20220201
    arriveTime: string; // 到达时间，4位数时分，1420，（表示14点20分）
    trainDate: string; // 发车日期，年月日，不带连接符，如20220201
    startTime: string; // 发车时间，4位数时分，1420，（表示14点20分）
    stationTrainCode: string; // 停靠车站的车次号
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
     * 实际发起调用的函数
     *
     * @param trainCode 车次号
     * @param startDay 出发日期，格式：YYYYMMDD
     */
    private static async queryTrainDetail(trainCode: string, startDay: string): Promise<any> {
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
        try {
            return JSON.parse(responseText);
        } catch (e) {
            console.error('JSON解析失败:', e);
            console.debug('原始接口返回:', responseText);
        }

        return {};
    }

    /**
     * 查询列车车次详情，并简化字段，减少空间
     *
     * @param trainCode 车次号
     * @param startDay 出发日期，格式：YYYYMMDD
     */
    public static async queryTrainDetailAndSimpleField(trainCode: string, startDay: string): Promise<TrainDetail> {
        try {
            startDay = startDay.replace(/-/g, ''); // 转换为需要的格式

            const data = await TrainDetailUtils.queryTrainDetail(trainCode, startDay);
            const result: TrainDetail = data?.data?.trainDetail || {} as TrainDetail;
            result.stopTime = result.stopTime || [];
            if (result.stopTime.length === 0) {
                console.debug(`列车${trainCode}, ${startDay}停靠数量为${result.stopTime.length}`)
            }

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
                    stationTrainCode: stopTime.stationTrainCode || '',

                } as StopTime
            }

            return result;
        } catch (error) {
            console.error(`Error in queryTrainDetail. 列车${trainCode}, ${startDay}查询异常:`, error);
            throw error;
        }
    }
}
