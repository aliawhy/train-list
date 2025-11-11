import {TrainInfo} from "../fetch/TrainQueryUtils";
import {StationOption} from "../fetch/StationUtils";

export interface TransferPath {
    costWithAddCost: number;
    costWithoutAddCost: number;
    path: StationPathPair[];
    mode: string;
    used: boolean;
}

export interface StationPathPair {
    station1: string
    station2: string
    train: string // 快速联程有， 用于记录是哪个车 （目前仅用于打印，暂不消费于其他！！）。 广东城际  目还没有赋值 // TODO 后续请仔细分析
}

export interface QueryData {
    departureStation: StationOption | string | null // 广东城际、定制中转全部改造为string了，其他还是StationOption
    arrivalStation: StationOption | string | null // 广东城际、定制中转全部改造为string了，其他还是StationOption
    departureDay: string
    customTransferCnt: number
    directPaths: TransferPath[]
    recommendPaths: TransferPath[]
    customPaths: TransferPath[]
    __load_finished__: boolean

    // 广东城际熟路模式
    isGDCJFamiliarMode: boolean
    // 简单车站最短换乘耗时
    simpleStationMinTransferTimeForGDCJ: number;
    // 复杂车站最短换乘耗时
    complexStationMinTransferTimeForGDC: number;
}

export function stationPathPair2StringForShowV2(path: StationPathPair[]): string {
    return path.map(pair => `${pair.station1}→${pair.station2}`).join(' | ')
}

// 获取所有被使用的路径
export function getUsedPaths(queryData: QueryData): TransferPath[] {
    const usedPaths: TransferPath[] = [];

    queryData?.directPaths?.forEach(path => {
        if (path.used) {
            usedPaths.push(path);
        }
    });

    queryData?.recommendPaths?.forEach(path => {
        if (path.used) {
            usedPaths.push(path);
        }
    });

    queryData?.customPaths?.forEach(path => {
        if (path.used) {
            usedPaths.push(path);
        }
    });

    return usedPaths;
};

export interface JourneyData {
    id: string
    departureStation: StationOption | null
    arrivalStation: StationOption | null
    departureDay: string
    trainInfoList: TrainInfo[]
    trainInfoFilterList: TrainInfo[]
    departureStationsNames: string[]
    arrivalStationsNames: string[]
    selectedFilterDepartureStationsNames: string[]
    selectedFilterArrivalStationsNames: string[]
    selectedTrain: TrainInfo | null
}

// 定义过滤选项接口
export interface FilterOptions {
    selectedDepartureStations: string[]
    selectedTransferStations: string[]
    selectedArrivalStations: string[]
    earlyArrivalPriority: boolean
    sameStationEnabled: boolean
    withTransferHub: boolean // 枢纽换乘
    sameCityEnabled: boolean
    sameTrainChangeSeat: boolean
    transferStationsCnt: number // 换乘站数量
    transferTimes: number[] // 换乘预留时间
    transferCounts: number[] // 换乘次数，留空表示支持所有次数。[0]表示只看直达车 [0, 1]表示只看直达、1次换乘的。以此类推
    trainTypes: string[]
    seatTypes: string[]
    ticketAvailable: boolean // 这两个字段已经停用， 被 trainTypes 功能覆盖
    seatAvailable: boolean // 这两个字段已经停用， 被 seatTypes 功能覆盖
}