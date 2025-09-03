import fetch from 'node-fetch';

export interface TrainInfo {
    trainNumber: string; // 列车编号 如G123
    originTrainCode: string;  // 此车次的始发站的原始车次编码，比如苏州到上海K4915，原始车次编码是K4918，则值是93000K49180C，还未清楚原始车次编码93000K49180C转换成原始车次怎么提取
    departureCode: string; // 出发站编码
    arrivalCode: string;// 到达站编码
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
        console.log(`Fetching train data in ${trainDay} from ${fromStationCode} to ${toStationCode}`);


        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching train data:', error);
            throw error;
        }
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

            console.debug('api查询原生结果', tmpResults);
            const trainInfoList: TrainInfo[] = [];

            for (let i = 0; i < tmpResults.length; i++) {
                const tmpResult = tmpResults[i];
                const split = tmpResult.split("|");

                trainInfoList.push({
                    originTrainCode: split[2],
                    trainNumber: split[3],
                    departureCode: split[6],
                    arrivalCode: split[7],
                });
            }

            return {trainInfoList};
        } catch (error) {
            console.error('Error in queryTrainInfo:', error);
            throw error;
        }
    }
}
