import {FetchUtil} from "./FetchUtil";

export interface TrainInfo {
    trainNumber: string; // 列车编号 如G123
    departureTime: string;  // 出发时间12:01 这样的格式(已是北京时间)
    arrivalTime: string;  // 出发时间12:01 这样的格式(已是北京时间)
    originTrainCode: string;  // 此车次的始发站的原始车次编码，比如苏州到上海K4915，原始车次编码是K4918，则值是93000K49180C，还未清楚原始车次编码93000K49180C转换成原始车次怎么提取
    departureCode: string; // 出发站编码
    arrivalCode: string;// 到达站编码
    originStationCode: string; // 此趟列车，始发站编码
    terminalStationCode: string; // 此趟列车，终到站编码
}

export class TrainQueryUtils {
    static async fetchTrainData(
        trainDay: string,
        fromStationCode: string,
        toStationCode: string
    ) {
        const baseUrl = process.env.API_T;

        if (!baseUrl) {
            throw new Error('API_T environment variable is not set');
        }

        const url = `${baseUrl}?leftTicketDTO.train_date=${trainDay}&leftTicketDTO.from_station=${fromStationCode}&leftTicketDTO.to_station=${toStationCode}&purpose_codes=ADULT`;
        console.debug(`Fetching train data in ${trainDay} from ${fromStationCode} to ${toStationCode}`);

        try {
            const responseText = await FetchUtil.get(url, {
                headers: {
                    'cookie': '_jc_save_fromStation=%u5317%u4EAC%2CBJP;'
                },
                json: false
            });

            try {
                return JSON.parse(responseText);
            } catch (e) {
                console.error('JSON解析失败:', e);
                console.debug('原始接口返回:', responseText);
            }
        } catch (error) {
            console.error('Error fetching train data:', error);
            throw error;
        }

        return {}
    }

    static async queryTrainInfo(
        trainDay: string, // 乘车日期
        fromStationCode: string,
        toStationCode: string,
    ): Promise<{
        trainInfoList: TrainInfo[];
    }> {
        try {
            // 直接使用fetchTrainData返回的Promise
            const res = await this.fetchTrainData(trainDay, fromStationCode, toStationCode);
            const tmpResults = res.data?.result || [];

            const trainInfoList: TrainInfo[] = [];

            for (let i = 0; i < tmpResults.length; i++) {
                const tmpResult = tmpResults[i];
                const split = tmpResult.split("|");

                trainInfoList.push({
                    originTrainCode: split[2],
                    trainNumber: split[3],
                    originStationCode: split[4],
                    terminalStationCode: split[5],
                    departureCode: split[6],
                    arrivalCode: split[7],
                    departureTime: split[8], // 开车时刻，例如 "08:20"
                    arrivalTime: split[9], // 到达时刻，例如 "10:20"
                });
            }

            return {trainInfoList};
        } catch (error) {
            console.error('Error in queryTrainInfo:', error);
            throw error;
        }
    }
}
