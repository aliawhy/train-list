import {FetchUtil} from "./FetchUtil";

export interface StationOption {
    name: string // 车站名称
    code: string // 车站编码
    city: string // 车站城市
    pinyin: string // 车站拼音
}

export const stationNameList: StationOption[] = [];
export const stationName2CodeMap: Record<string, string> = {};
export const stationCode2NameMap: Record<string, string> = {};
export const stationName2CityMap: Record<string, string> = {};
export const stationName2OptionMap: Record<string, StationOption> = {};
export const stationCode2OptionMap: Record<string, StationOption> = {};

export async function fetch12306StationData() {


    const url = 'https://kyfw.12306.cn/otn/resources/js/framework/station_name.js?station_version=1.9353'

    const data = await FetchUtil.fetch(url, false)

    const splits = data.split("@"); // 按@拆分不同车站
    for (let i = 0; i < splits.length; i++) {

        const items = splits[i].split("|"); // 每个车站信息用|拆分
        // 确保数据格式正确，通常格式为: bjb|北京北|VAP|beijingbei|bjb|...
        if (items.length < 5) {
            continue;
        }

        const name = items[1];  // 车站名，如 "北京北"
        const code = items[2];  // 车站代码，如 "VAP"
        const pinyin = items[3]; // 拼音，如 "beijingbei"
        const city = items[7]; // 所属城市，如 "北京"

        const option = {
            name: name,
            code: code,
            pinyin: pinyin,
            city: city,
        } as StationOption;
        stationNameList.push(option);

        stationName2CodeMap[name] = code;
        stationCode2NameMap[code] = name;
        stationName2CityMap[name] = city;
        stationName2OptionMap[name] = option;
        stationCode2OptionMap[code] = option;
    }

    // 按车站名排序
    stationNameList.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

}

