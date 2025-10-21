import * as fs from 'fs';
import * as path from 'path';
import {EventType, OperationTrackingParams, QueryModuleType} from "../operation-tracking/OperationTrackingEntity";
import {QueryData, TransferPath, StationPathPair} from "./journey-query-filter-types";
import {StationOption} from "../fetch/StationUtils";
import {getBeijingTimeString} from "../date/DateUtil";

// --- 类型定义和辅助接口 ---

// 为了方便分析，我们定义一个更结构化的数据类型
interface AnalyzedQueryData {
    userUuid: string;
    eventTimestamp: number;
    queryModule: QueryModuleType;
    departureStation: string;
    arrivalStation: string;
    departureDay: string;
    rawPayload: any; // 保留原始payload，用于后续详细分析
}

// 定义一个更详细的统计结果接口
interface DetailedStats {
    routeCounts: { [route: string]: number };
    totalStationCounts: { [station: string]: number };
    departureStationCounts: { [station: string]: number };
    arrivalStationCounts: { [station: string]: number };
}

// 定义按模块分类的统计结果
interface StatsByModule {
    all: DetailedStats;
    guangdong: DetailedStats;
    rapid: DetailedStats; // rapid 代表 定制中转
    exact: DetailedStats; // exact 代表 拼接中转
}

// 用户轨迹接口
interface UserTrajectory {
    [userUuid: string]: AnalyzedQueryData[];
}

// [新增] 定制中转模块的深度分析数据结构
interface CustomTransferAnalysis {
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


// --- 辅助函数 ---

/**
 * 获取所有被使用的路径
 */
function getUsedPaths(queryData: QueryData): TransferPath[] {
    const usedPaths: TransferPath[] = [];
    if (!queryData) return usedPaths;

    queryData?.directPaths?.forEach(path => { if (path.used) usedPaths.push(path); });
    queryData?.recommendPaths?.forEach(path => { if (path.used) usedPaths.push(path); });
    queryData?.customPaths?.forEach(path => { if (path.used) usedPaths.push(path); });

    return usedPaths;
}

/**
 * 将路径对转换为显示字符串
 */
function stationPathPair2StringForShowV2(path: StationPathPair[]): string {
    return path.map(pair => `${pair.station1}→${pair.station2}`).join(' | ');
}


// --- 核心分析函数 ---

/**
 * 主分析函数，协调整个分析流程
 * @param filePath JSON文件路径
 */
export function generateOperationTrackEventQueryReport(filePath: string): void {
    try {
        const rawData = readAndParseJson(filePath);
        if (!rawData || rawData.length === 0) {
            console.log("文件为空或解析失败，无法生成报告。");
            return;
        }

        const analyzedData = transformData(rawData);

        // 1. 总体概览统计
        const totalQueries = analyzedData.length;
        const guangdongQueries = analyzedData.filter(d => d.queryModule === '广东城际');
        const rapidQueries = analyzedData.filter(d => d.queryModule === '定制中转');
        const exactQueries = analyzedData.filter(d => d.queryModule === '拼接中转');

        const detailedStats = getDetailedStats(analyzedData);
        const uniqueUsers = new Set(analyzedData.map(d => d.userUuid)).size;
        const avgQueriesPerUser = totalQueries > 0 ? (totalQueries / uniqueUsers).toFixed(2) : '0';
        const userTrajectories = getUserTrajectories(analyzedData);

        // 2. [新增] 定制中转深度分析
        const customTransferAnalysis = analyzeCustomTransferModule(analyzedData);

        // 3. 生成报告内容
        const reportContent = buildReportContent({
            totalQueries,
            guangdongCount: guangdongQueries.length,
            rapidCount: rapidQueries.length,
            exactCount: exactQueries.length,
            detailedStats,
            userTrajectories,
            uniqueUsers,
            avgQueriesPerUser,
            filePath,
            customTransferAnalysis // [新增] 传递深度分析结果
        });

        const reportFilePath = `${filePath}.report.txt`;
        fs.writeFileSync(reportFilePath, reportContent, 'utf-8');
        console.log(`运营报告已成功生成: ${reportFilePath}`);

    } catch (error) {
        console.error(`处理文件时发生错误: ${error instanceof Error ? error.message : error}`);
    }
}

/**
 * 读取并解析JSON文件
 */
function readAndParseJson(filePath: string): OperationTrackingParams<EventType>[] {
    const absolutePath = path.resolve(filePath);
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    const jsonArray = JSON.parse(fileContent) as OperationTrackingParams<EventType>[];
    if (!Array.isArray(jsonArray)) {
        throw new Error("文件内容不是一个有效的 JSON 数组。");
    }
    return jsonArray;
}

/**
 * 将原始数据转换为更易于分析的格式
 */
function transformData(rawData: OperationTrackingParams<EventType>[]): AnalyzedQueryData[] {
    return rawData
        .filter(event => event.eventType === EventType.QUERY && event.payload)
        .map(event => {
            const payload = event.payload as any;
            const queryData = payload.queryData as QueryData;

            const getStationName = (station: StationOption | string | null | undefined): string => {
                if (typeof station === 'string' && station) return station;
                if (station && typeof station === 'object' && station.name) return station.name;
                return '未知车站';
            };

            return {
                userUuid: event.userUuid,
                eventTimestamp: event.eventTimestamp,
                queryModule: payload.queryModule,
                departureStation: getStationName(queryData.departureStation),
                arrivalStation: getStationName(queryData.arrivalStation),
                departureDay: queryData.departureDay || '未知日期',
                rawPayload: payload,
            };
        });
}

/**
 * 生成详细的统计数据，按模块分类
 */
function getDetailedStats(data: AnalyzedQueryData[]): StatsByModule {
    const stats: StatsByModule = {
        all: {routeCounts: {}, totalStationCounts: {}, departureStationCounts: {}, arrivalStationCounts: {}},
        guangdong: {routeCounts: {}, totalStationCounts: {}, departureStationCounts: {}, arrivalStationCounts: {}},
        rapid: {routeCounts: {}, totalStationCounts: {}, departureStationCounts: {}, arrivalStationCounts: {}},
        exact: {routeCounts: {}, totalStationCounts: {}, departureStationCounts: {}, arrivalStationCounts: {}},
    };

    data.forEach(item => {
        const {queryModule, departureStation, arrivalStation} = item;
        const route = `${departureStation}→${arrivalStation}`;
        updateStatsForModule(stats.all, departureStation, arrivalStation, route);
        if (queryModule === '广东城际') updateStatsForModule(stats.guangdong, departureStation, arrivalStation, route);
        else if (queryModule === '定制中转') updateStatsForModule(stats.rapid, departureStation, arrivalStation, route);
        else if (queryModule === '拼接中转') updateStatsForModule(stats.exact, departureStation, arrivalStation, route);
    });

    return stats;
}

/**
 * 辅助函数：为单个模块更新统计数据
 */
function updateStatsForModule(moduleStats: DetailedStats, departure: string, arrival: string, route: string): void {
    moduleStats.routeCounts[route] = (moduleStats.routeCounts[route] || 0) + 1;
    moduleStats.totalStationCounts[departure] = (moduleStats.totalStationCounts[departure] || 0) + 1;
    moduleStats.totalStationCounts[arrival] = (moduleStats.totalStationCounts[arrival] || 0) + 1;
    moduleStats.departureStationCounts[departure] = (moduleStats.departureStationCounts[departure] || 0) + 1;
    moduleStats.arrivalStationCounts[arrival] = (moduleStats.arrivalStationCounts[arrival] || 0) + 1;
}

/**
 * 生成用户轨迹
 */
function getUserTrajectories(data: AnalyzedQueryData[]): UserTrajectory {
    const trajectories: UserTrajectory = {};
    data.forEach(item => {
        if (!trajectories[item.userUuid]) trajectories[item.userUuid] = [];
        trajectories[item.userUuid].push(item);
    });
    for (const userUuid in trajectories) {
        trajectories[userUuid].sort((a, b) => a.eventTimestamp - b.eventTimestamp);
    }
    return trajectories;
}

/**
 * [新增] 分析定制中转模块的深度数据
 */
function analyzeCustomTransferModule(allData: AnalyzedQueryData[]): CustomTransferAnalysis {
    const analysis: CustomTransferAnalysis = {
        totalQueries: 0, totalUsedPaths: 0, directPathUsageCount: 0, recommendPathUsageCount: 0,
        customPathUsageCount: 0, totalTransferStops: 0, queriesWithTransfer: 0,
        exploratoryUserQueries: 0, directOnlyQueries: 0, noValidPathQueries: 0
    };

    const customQueries = allData.filter(d => d.queryModule === '定制中转');
    analysis.totalQueries = customQueries.length;

    customQueries.forEach(event => {
        const queryData = event.rawPayload.queryData as QueryData;
        const usedDirectPaths = queryData?.directPaths?.filter(p => p.used) ?? [];
        const usedRecommendPaths = queryData?.recommendPaths?.filter(p => p.used) ?? [];
        const usedCustomPaths = queryData?.customPaths?.filter(p => p.used) ?? [];

        const totalUsedInThisQuery = usedDirectPaths.length + usedRecommendPaths.length + usedCustomPaths.length;
        analysis.totalUsedPaths += totalUsedInThisQuery;

        analysis.directPathUsageCount += usedDirectPaths.length;
        analysis.recommendPathUsageCount += usedRecommendPaths.length;
        analysis.customPathUsageCount += usedCustomPaths.length;

        // 计算中转站数
        const allTransferPaths = [...usedRecommendPaths, ...usedCustomPaths];
        allTransferPaths.forEach(path => {
            analysis.totalTransferStops += (path.path.length - 1);
        });

        if (allTransferPaths.length > 0) {
            analysis.queriesWithTransfer++;
        }

        // 判断用户类型
        if (usedRecommendPaths.length > 0 && usedCustomPaths.length > 0) {
            analysis.exploratoryUserQueries++;
        } else if (totalUsedInThisQuery > 0 && usedDirectPaths.length === totalUsedInThisQuery) {
            analysis.directOnlyQueries++;
        }

        if (totalUsedInThisQuery === 0) {
            analysis.noValidPathQueries++;
        }
    });

    return analysis;
}


/**
 * 构建最终的报告文本
 */
function buildReportContent(stats: {
    totalQueries: number; guangdongCount: number; rapidCount: number; exactCount: number;
    detailedStats: StatsByModule; userTrajectories: UserTrajectory; uniqueUsers: number;
    avgQueriesPerUser: string; filePath: string;
    customTransferAnalysis: CustomTransferAnalysis; // [新增]
}): string {
    let output = '';

    // === 报告头部 ===
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                    运营数据报告 (Operation Report)                                    ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n\n';

    // === 1. 总体概览 ===
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                          1. 总体概览                                               ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
    output += `总查询量: ${stats.totalQueries}\n`;
    output += `独立用户数 (UV): ${stats.uniqueUsers}\n`;
    output += `人均查询次数: ${stats.avgQueriesPerUser}\n\n`;
    output += `--- 按模块分布 ---\n`;
    output += `广东城际板块查询量: ${stats.guangdongCount}\n`;
    output += `定制中转板块查询量: ${stats.rapidCount}\n`;
    output += `拼接中转板块查询量: ${stats.exactCount}\n\n`;

    // === 2. Top 10 数据详情 ===
    const modules = [
        {key: 'all', name: '全模块'}, {key: 'guangdong', name: '广东城际'},
        {key: 'rapid', name: '定制中转'}, {key: 'exact', name: '拼接中转'},
    ];
    modules.forEach(module => {
        const moduleStats = stats.detailedStats[module.key as keyof StatsByModule];
        output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
        output += `║                                   2. ${module.name} Top 10 数据详情                                    ║\n`;
        output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n`;
        output += `--- 2.1 查询线路 Top 10 ---\n`; output += appendTopList(moduleStats.routeCounts, '次'); output += '\n';
        output += `--- 2.2 查询车站 Top 10 (出发或到达) ---\n`; output += appendTopList(moduleStats.totalStationCounts, '次'); output += '\n';
        output += `--- 2.3 出发车站 Top 10 ---\n`; output += appendTopList(moduleStats.departureStationCounts, '次'); output += '\n';
        output += `--- 2.4 到达车站 Top 10 ---\n`; output += appendTopList(moduleStats.arrivalStationCounts, '次'); output += '\n\n';
    });

    // === 3. 定制中转模块深度分析 ===
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                   3. 定制中转模块深度分析                                          ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
    const { customTransferAnalysis } = stats;
    if (customTransferAnalysis.totalQueries === 0) {
        output += '定制中转模块无查询数据。\n\n';
    } else {
        // 3.1 路径使用分析
        output += `--- 3.1 路径使用分析 (基于 ${customTransferAnalysis.totalQueries} 次查询) ---\n`;
        output += `总采纳路径数: ${customTransferAnalysis.totalUsedPaths}\n`;
        output += `  - 直达路径采纳: ${customTransferAnalysis.directPathUsageCount} 次 (${(customTransferAnalysis.directPathUsageCount / customTransferAnalysis.totalUsedPaths * 100).toFixed(2)}%)\n`;
        output += `  - 推荐路径采纳: ${customTransferAnalysis.recommendPathUsageCount} 次 (${(customTransferAnalysis.recommendPathUsageCount / customTransferAnalysis.totalUsedPaths * 100).toFixed(2)}%)\n`;
        output += `  - 自定义路径采纳: ${customTransferAnalysis.customPathUsageCount} 次 (${(customTransferAnalysis.customPathUsageCount / customTransferAnalysis.totalUsedPaths * 100).toFixed(2)}%)\n\n`;

        // 3.2 中转偏好分析
        output += `--- 3.2 中转偏好分析 ---\n`;
        const avgTransfers = customTransferAnalysis.queriesWithTransfer > 0 ? (customTransferAnalysis.totalTransferStops / customTransferAnalysis.queriesWithTransfer).toFixed(2) : '0';
        output += `平均中转次数 (仅限有中转的查询): ${avgTransfers} 次\n`;
        output += `涉及中转的查询数: ${customTransferAnalysis.queriesWithTransfer} 次 (${(customTransferAnalysis.queriesWithTransfer / customTransferAnalysis.totalQueries * 100).toFixed(2)}%)\n\n`;

        // 3.3 用户行为洞察
        output += `--- 3.3 用户行为洞察 ---\n`;
        output += `“探索型”用户查询 (同时使用推荐和自定义): ${customTransferAnalysis.exploratoryUserQueries} 次 (${(customTransferAnalysis.exploratoryUserQueries / customTransferAnalysis.totalQueries * 100).toFixed(2)}%)\n`;
        output += `“纯直达”用户查询 (仅使用直达路径): ${customTransferAnalysis.directOnlyQueries} 次 (${(customTransferAnalysis.directOnlyQueries / customTransferAnalysis.totalQueries * 100).toFixed(2)}%)\n`;
        output += `无有效路径的查询: ${customTransferAnalysis.noValidPathQueries} 次 (${(customTransferAnalysis.noValidPathQueries / customTransferAnalysis.totalQueries * 100).toFixed(2)}%)\n\n`;
    }

    // === 4. 用户轨迹 ===
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                          4. 用户轨迹                                               ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
    const sortedUserIds = Object.keys(stats.userTrajectories).sort();
    if (sortedUserIds.length === 0) {
        output += '暂无用户轨迹数据。\n';
    } else {
        sortedUserIds.forEach(userUuid => {
            output += `--- 用户ID: ${userUuid} ---\n`;
            const trajectory = stats.userTrajectories[userUuid];
            trajectory.forEach((event, index) => {
                const date = getBeijingTimeString(event.eventTimestamp, 'datetime');
                output += `  ${index + 1}. [${date}] ${event.queryModule} ${event.departureStation}→${event.arrivalStation} (出发日期: ${event.departureDay})\n`;

                if (event.queryModule === '定制中转') {
                    const queryData = event.rawPayload.queryData as QueryData;
                    let hasAnyPath = false;
                    if (queryData?.directPaths) queryData.directPaths.forEach(path => { if (path.used) { hasAnyPath = true; output += `    - 直达路径: ${stationPathPair2StringForShowV2(path.path)}\n`; }});
                    if (queryData?.recommendPaths) queryData.recommendPaths.forEach(path => { if (path.used) { hasAnyPath = true; output += `    - 推荐路径: ${stationPathPair2StringForShowV2(path.path)}\n`; }});
                    if (queryData?.customPaths) queryData.customPaths.forEach(path => { if (path.used) { hasAnyPath = true; output += `    - 手动路径: ${stationPathPair2StringForShowV2(path.path)}\n`; }});
                    if (!hasAnyPath) output += `    - 路径: (无有效路径)\n`;
                }
            });
            output += '\n';
        });
    }

    return output;
}

/**
 * 辅助函数：将Top列表格式化后返回字符串
 */
function appendTopList(counts: { [key: string]: number }, unit: string): string {
    const sortedList = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 10);
    if (sortedList.length === 0) return '暂无数据。\n';
    let result = '';
    sortedList.forEach(([name, count], index) => { result += `${index + 1}. ${name}: ${count} ${unit}\n`; });
    return result;
}

// --- 执行函数 ---
// const jsonFilePath = 'D:\\工作区\\软件项目\\gitee\\mini-service-database\\track-query\\track-query_2025-10-15.json';
// generateOperationTrackEventQueryReport(jsonFilePath);
