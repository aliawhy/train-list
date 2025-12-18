import {QueryModuleType} from "../operation-tracking/OperationTrackingEntity";

// 原始数据经过初步解析后的结构
export interface AnalyzedQueryData {
    userUuid: string;
    eventTimestamp: number;
    queryModule: QueryModuleType;
    departureStation: string;
    arrivalStation: string;
    departureDay: string;
    rawPayload: any; // 保留原始payload，用于后续详细分析
    // 广东城际熟路模式相关字段
    isGDCJFamiliarMode: boolean;
    simpleStationMinTransferTimeForGDCJ: number | null;
    complexStationMinTransferTimeForGDC: number | null;
}

// 一个通用的详细统计结果接口
export interface DetailedStats {
    routeCounts: { [route: string]: number };
    totalStationCounts: { [station: string]: number };
    departureStationCounts: { [station: string]: number };
    arrivalStationCounts: { [station: string]: number };
}

// 用户轨迹接口
export interface UserTrajectory {
    [userUuid: string]: AnalyzedQueryData[];
}

// 用于构建报告的参数集合
export interface ReportBuildParams {
    totalQueries: number;
    guangdongIntercityCount: number; // 广东城际查询量
    guangdongRailwayCount: number; // 广东铁路查询量
    customTransferCount: number; // 定制中转
    exactTransferCount: number; // 拼接中转
    detailedStats: Record<string, DetailedStats>; // 使用 Record 来动态匹配模块名
    userTrajectories: UserTrajectory;
    uniqueUsers: number;
    avgQueriesPerUser: string;
    filePath: string;
    moduleAnalyses: Record<string, ModuleAnalysisResult>; // 存放各模块的深度分析结果
}

// 模块分析器的通用返回结果
export interface ModuleAnalysisResult {
    summary: string;
}

// 定制中转模块的深度分析数据结构
export interface CustomTransferAnalysis extends ModuleAnalysisResult {
    totalQueries: number;
    totalUsedPaths: number;
    directPathUsageCount: number;
    recommendPathUsageCount: number;
    customPathUsageCount: number;
    totalTransferStops: number; // 所有中转路径的总中转站数
    queriesWithTransfer: number; // 使用了至少一条中转路径的查询数
    exploratoryUserQueries: number; // 同时使用推荐和自定义路径的查询数
    directOnlyQueries: number; // 只使用了直达路径的查询数
    noValidPathQueries: number; // 没有任何路径被使用的查询数
}

// 广东城际模块的深度分析数据结构
export interface GuangdongAnalysis extends ModuleAnalysisResult {
    familiarModeCount: number;
    basicModeCount: number;
    simpleTransferTimeCounts: { [time: number]: number };
    complexTransferTimeCounts: { [time: number]: number };
}

// 拼接中转模块的深度分析数据结构 (目前为空，但结构已准备好)
export interface ExactTransferAnalysis extends ModuleAnalysisResult {
    // 未来可以添加拼接中转特有的分析字段
}

// 用于 Top 列表格式化的参数
export interface TopListOptions {
    unit: string;
    limit?: number;
    isKeyNumeric?: boolean;
}
