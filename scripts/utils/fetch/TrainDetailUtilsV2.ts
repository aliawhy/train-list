import fetch from 'node-fetch';
import {TrainInfo} from "./TrainQueryUtils";

// 列车详情接口
export interface TrainDetailV2 {
    data: TrainStation[];
    queryDay: string
}

interface TrainStation {
    station_train_code: string; // 在TrainDetailV2里， 只有第一个TrainStation有车次值
    arrive_time: string; // 时分 06:00
    station_name: string;
    start_time: string;
    stopover_time: string;
    station_no: string;
    country_code: string;
    country_name: string;
    isEnabled: boolean;
}

/**
 * 列车车次详情查询工具类
 */
export class TrainDetailUtilsV2 {
    /**
     * 获取列车数据
     * 实际发起调用的函数
     *
     * @param originTrainCode 车次原始 :
     * @param startDay 出发日期，格式：YYYY-MM-DD
     */
    public static async queryTrainDetail(
        departureName: string,
        arrivalName: string,
        queryDay: string,
        trainInfo: TrainInfo): Promise<TrainDetailV2> {


        const baseUrl = 'https://kyfw.12306.cn/otn/czxx/queryByTrainNo';

        const url = `${baseUrl}?train_no=${trainInfo.originTrainCode}&from_station_telecode=${trainInfo.departureCode}&to_station_telecode=${trainInfo.arrivalCode}&depart_date=${queryDay}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'cookie': '_jc_save_fromStation=%u5317%u4EAC%2CBJP;'
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 打印原始响应文本
        const responseText = await response.text();
        try {
            return JSON.parse(responseText).data as TrainDetailV2;
        } catch (e) {
            console.error('JSON解析失败:', e);
            console.debug('原始接口返回:', responseText);
        }

        return {data: []} as TrainDetailV2;
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
