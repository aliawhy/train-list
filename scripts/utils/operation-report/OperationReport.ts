import * as fs from 'fs';
import * as path from 'path';
// import {QueryModuleType} from
import {EventType, OperationTrackingParams, QueryModuleType} from "../operation-tracking/OperationTrackingEntity";
import {QueryData} from "./journey-query-filter-types";
import {StationOption} from "../fetch/StationUtils";
import {getBeijingTimeString} from "../date/DateUtil";
// import {QueryData, StationOption} from "../../train/entity/journey-query-filter-types";
// import {getBeijingTimeString} from "../../train/utils/date/DateUtil";

// --- 类型定义和辅助接口 ---

// 为了方便分析，我们定义一个更结构化的数据类型
interface AnalyzedQueryData {
    userUuid: string;
    eventTimestamp: number;
    queryModule: QueryModuleType;
    departureStation: string;
    arrivalStation: string;
    isAutoMode: boolean | null; // null for 非快速联程
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
    rapid: DetailedStats;
    exact: DetailedStats;
}

// 用户轨迹接口
interface UserTrajectory {
    [userUuid: string]: AnalyzedQueryData[];
}


// --- 核心分析函数 ---

/**
 * 主分析函数，协调整个分析流程
 * @param filePath JSON文件路径
 */
export function generateOperationTrackEventQueryReport(filePath: string): void {
    try {
        // 1. 读取和解析数据
        const rawData = readAndParseJson(filePath);
        if (!rawData || rawData.length === 0) {
            console.log("文件为空或解析失败，无法生成报告。");
            return;
        }

        // 2. 数据清洗和结构化
        const analyzedData = transformData(rawData);

        // 3. 执行各项分析
        const totalQueries = analyzedData.length;
        const guangdongQueries = analyzedData.filter(d => d.queryModule === '广东城际');
        const rapidQueries = analyzedData.filter(d => d.queryModule === '快速联程');
        const exactQueries = analyzedData.filter(d => d.queryModule === '精确联程');

        const guangdongCount = guangdongQueries.length;
        const rapidCount = rapidQueries.length;
        const exactCount = exactQueries.length;

        // 4. 获取详细的统计数据
        const detailedStats = getDetailedStats(analyzedData);

        // 5. 补充分析
        const uniqueUsers = new Set(analyzedData.map(d => d.userUuid)).size;
        const avgQueriesPerUser = totalQueries > 0 ? (totalQueries / uniqueUsers).toFixed(2) : '0';
        const userTrajectories = getUserTrajectories(analyzedData);

        // 6. 生成报告内容
        const reportContent = buildReportContent({
            totalQueries,
            guangdongCount,
            rapidCount,
            exactCount,
            detailedStats,
            userTrajectories,
            uniqueUsers,
            avgQueriesPerUser,
            filePath  // 传递 filePath 参数
        });

        // 7. 写入报告文件
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
            const payload = event.payload as any; // 使用any进行类型断言，因为payload结构是动态的
            const queryData = payload.queryData as QueryData;

            // 统一车站名称的提取逻辑，兼容 string 和 StationOption
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
                isAutoMode: payload.queryModule === '快速联程' ? queryData.autoTransferStation : null,
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

        // 更新 'all' 模块的统计
        updateStatsForModule(stats.all, departureStation, arrivalStation, route);

        // 根据具体模块更新对应统计
        if (queryModule === '广东城际') {
            updateStatsForModule(stats.guangdong, departureStation, arrivalStation, route);
        } else if (queryModule === '快速联程') {
            updateStatsForModule(stats.rapid, departureStation, arrivalStation, route);
        } else if (queryModule === '精确联程') {
            updateStatsForModule(stats.exact, departureStation, arrivalStation, route);
        }
    });

    return stats;
}

/**
 * 辅助函数：为单个模块更新统计数据
 */
function updateStatsForModule(moduleStats: DetailedStats, departure: string, arrival: string, route: string): void {
    // 1. 查询线路统计
    moduleStats.routeCounts[route] = (moduleStats.routeCounts[route] || 0) + 1;

    // 2. 查询车站统计 (出发或到达)
    moduleStats.totalStationCounts[departure] = (moduleStats.totalStationCounts[departure] || 0) + 1;
    moduleStats.totalStationCounts[arrival] = (moduleStats.totalStationCounts[arrival] || 0) + 1;

    // 3. 出发车站统计
    moduleStats.departureStationCounts[departure] = (moduleStats.departureStationCounts[departure] || 0) + 1;

    // 4. 到达车站统计
    moduleStats.arrivalStationCounts[arrival] = (moduleStats.arrivalStationCounts[arrival] || 0) + 1;
}


/**
 * 生成用户轨迹
 */
function getUserTrajectories(data: AnalyzedQueryData[]): UserTrajectory {
    const trajectories: UserTrajectory = {};
    data.forEach(item => {
        if (!trajectories[item.userUuid]) {
            trajectories[item.userUuid] = [];
        }
        trajectories[item.userUuid].push(item);
    });

    // 对每个用户的轨迹按时间排序
    for (const userUuid in trajectories) {
        trajectories[userUuid].sort((a, b) => a.eventTimestamp - b.eventTimestamp);
    }

    return trajectories;
}

/**
 * 构建最终的报告文本
 */
function buildReportContent(stats: {
    totalQueries: number;
    guangdongCount: number;
    rapidCount: number;
    exactCount: number;
    detailedStats: StatsByModule;
    userTrajectories: UserTrajectory;
    uniqueUsers: number;
    avgQueriesPerUser: string;
    filePath: string;  // 添加 filePath 参数
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
    output += `快速联程板块查询量: ${stats.rapidCount}\n`;
    output += `精确联程板块查询量: ${stats.exactCount}\n\n`;

    // === 2. Top 10 数据详情 ===
    const modules = [
        {key: 'all', name: '全模块'},
        {key: 'guangdong', name: '广东城际'},
        {key: 'rapid', name: '快速联程'},
        {key: 'exact', name: '精确联程'},
    ];

    modules.forEach(module => {
        const moduleStats = stats.detailedStats[module.key as keyof StatsByModule];
        output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
        output += `║                                   2. ${module.name} Top 10 数据详情                                    ║\n`;
        output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';

        // 2.1 查询线路 Top 10
        output += `--- 2.1 查询线路 Top 10 ---\n`;
        output += appendTopList(moduleStats.routeCounts, '次');
        output += '\n';

        // 2.2 查询车站 Top 10 (出发或到达)
        output += `--- 2.2 查询车站 Top 10 (出发或到达) ---\n`;
        output += appendTopList(moduleStats.totalStationCounts, '次');
        output += '\n';

        // 2.3 出发车站 Top 10
        output += `--- 2.3 出发车站 Top 10 ---\n`;
        output += appendTopList(moduleStats.departureStationCounts, '次');
        output += '\n';

        // 2.4 到达车站 Top 10
        output += `--- 2.4 到达车站 Top 10 ---\n`;
        output += appendTopList(moduleStats.arrivalStationCounts, '次');
        output += '\n\n';
    });

    // === 3. 快速联程查询模式占比 ===
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                   3. 快速联程查询模式占比                                          ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
    const rapidQueries = Object.values(stats.detailedStats.rapid.routeCounts).reduce((sum, count) => sum + count, 0);
    if (rapidQueries === 0) {
        output += '快速联程模块无查询数据。\n';
    } else {
        // 重新计算快速联程的模式占比
        const analyzedData = transformData(readAndParseJson(stats.filePath));
        let auto = 0, manual = 0;
        analyzedData.forEach(item => {
            if (item.queryModule === '快速联程') {
                if (item.isAutoMode === true) auto++;
                if (item.isAutoMode === false) manual++;
            }
        });
        const autoPercent = ((auto / rapidQueries) * 100).toFixed(2);
        const manualPercent = ((manual / rapidQueries) * 100).toFixed(2);
        output += `自动模式 (autoTransferStation: true): ${auto} 次 (${autoPercent}%)\n`;
        output += `手动模式 (autoTransferStation: false): ${manual} 次 (${manualPercent}%)\n`;
    }
    output += '\n';

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
                const modeText = event.isAutoMode !== null ? (event.isAutoMode ? '自动' : '手动') : '';
                output += `  ${index + 1}. [${date}] ${event.queryModule} ${event.departureStation}→${event.arrivalStation} ${modeText}\n`;
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
    const sortedList = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    if (sortedList.length === 0) {
        return '暂无数据。\n';
    }

    let result = '';
    sortedList.forEach(([name, count], index) => {
        result += `${index + 1}. ${name}: ${count} ${unit}\n`;
    });

    return result;
}


// --- 执行函数 ---
// 确保这里的路径是正确的
// const jsonFilePath = 'D:\\工作区\\软件项目\\gitee\\mini-service-database\\track-query\\track-query_2025-10-15.json';
// 会得到输出 'D:\\工作区\\软件项目\\gitee\\mini-service-database\\track-query\\track-query_2025-10-15.json.report.txt';
// generateOperationTrackEventQueryReport(jsonFilePath);
