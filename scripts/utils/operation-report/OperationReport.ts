import * as fs from 'fs';
import * as path from 'path';
// import {QueryModuleType} from
import {EventType, OperationTrackingParams, QueryModuleType} from "../operation-tracking/OperationTrackingEntity";
import {QueryData, TransferPath, StationPathPair} from "./journey-query-filter-types"; // [修改点] 确保导入 TransferPath 和 StationPathPair
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
    rawPayload: any; // [修改点] 保留原始payload，用于后续详细分析
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

// --- [新增] 辅助函数声明 ---
// 假设这两个函数与 QueryData 在同一文件，或已正确导入
/**
 * 获取所有被使用的路径
 */
function getUsedPaths(queryData: QueryData): TransferPath[] {
    const usedPaths: TransferPath[] = [];
    if (!queryData) return usedPaths;

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
        // [修改点 1] 数据分类逻辑已包含新旧名称，无需改动
        const guangdongQueries = analyzedData.filter(d => d.queryModule === '广东城际');
        const rapidQueries = analyzedData.filter(d => d.queryModule === '快速联程' || d.queryModule === '定制中转');
        const exactQueries = analyzedData.filter(d => d.queryModule === '精确联程' || d.queryModule === '拼接中转');

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
                isAutoMode: payload.queryModule === '快速联程' ? queryData.autoTransferStation : null, // 注意：旧版快速联程有此字段
                rawPayload: payload, // [修改点] 保留原始payload
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
            // [修改点 2] 更新统计模块的判断逻辑，以包含新的模块名称
        } else if (queryModule === '快速联程' || queryModule === '定制中转') {
            updateStatsForModule(stats.rapid, departureStation, arrivalStation, route);
        } else if (queryModule === '精确联程' || queryModule === '拼接中转') {
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
    filePath: string;
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
        {key: 'all', name: '全模块'},
        {key: 'guangdong', name: '广东城际'},
        {key: 'rapid', name: '定制中转'},
        {key: 'exact', name: '拼接中转'},
    ];

    modules.forEach(module => {
        const moduleStats = stats.detailedStats[module.key as keyof StatsByModule];
        output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
        output += `║                                   2. ${module.name} Top 10 数据详情                                    ║\n`;
        output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';

        output += `--- 2.1 查询线路 Top 10 ---\n`;
        output += appendTopList(moduleStats.routeCounts, '次');
        output += '\n';

        output += `--- 2.2 查询车站 Top 10 (出发或到达) ---\n`;
        output += appendTopList(moduleStats.totalStationCounts, '次');
        output += '\n';

        output += `--- 2.3 出发车站 Top 10 ---\n`;
        output += appendTopList(moduleStats.departureStationCounts, '次');
        output += '\n';

        output += `--- 2.4 到达车站 Top 10 ---\n`;
        output += appendTopList(moduleStats.arrivalStationCounts, '次');
        output += '\n\n';
    });

    // === 3. 定制中转查询模式占比 ===
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                   3. 定制中转查询模式占比                                          ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';

    const rapidAndCustomQueries = Object.values(stats.userTrajectories).flat().filter(
        event => event.queryModule === '定制中转' || event.queryModule === '快速联程'
    );

    if (rapidAndCustomQueries.length === 0) {
        output += '定制中转/快速联程模块无查询数据。\n';
    } else {
        let autoCount = 0, manualCount = 0, unknownCount = 0;
        let legacyAutoCount = 0, legacyManualCount = 0;

        rapidAndCustomQueries.forEach(event => {
            if (event.queryModule === '定制中转') {
                const queryData = event.rawPayload.queryData as QueryData;
                const hasUsedRecommendPath = queryData?.recommendPaths?.some(p => p.used) ?? false;
                const hasUsedCustomPath = queryData?.customPaths?.some(p => p.used) ?? false;
                if (hasUsedRecommendPath) autoCount++;
                else if (hasUsedCustomPath) manualCount++;
                else unknownCount++;
            } else if (event.queryModule === '快速联程') {
                if (event.isAutoMode === true) legacyAutoCount++;
                else if (event.isAutoMode === false) legacyManualCount++;
                else unknownCount++;
            }
        });

        const totalRapidQueries = rapidAndCustomQueries.length;
        const totalNewQueries = autoCount + manualCount + unknownCount;
        const totalLegacyQueries = legacyAutoCount + legacyManualCount;

        output += `--- 总计 (${totalRapidQueries} 次查询) ---\n`;
        if (totalNewQueries > 0) {
            output += `  [新版“定制中转”] - 共 ${totalNewQueries} 次\n`;
            output += `    - 自动模式 (采纳推荐): ${autoCount} 次 (${(autoCount / totalNewQueries * 100).toFixed(2)}%)\n`;
            output += `    - 手动模式 (完全自定义): ${manualCount} 次 (${(manualCount / totalNewQueries * 100).toFixed(2)}%)\n`;
            output += `    - 未知/其他模式 (如仅使用直达): ${unknownCount} 次 (${(unknownCount / totalNewQueries * 100).toFixed(2)}%)\n`;
        }
        if (totalLegacyQueries > 0) {
            output += `  [旧版“快速联程”] - 共 ${totalLegacyQueries} 次 (基于 autoTransferStation 字段)\n`;
            output += `    - 自动模式: ${legacyAutoCount} 次 (${(legacyAutoCount / totalLegacyQueries * 100).toFixed(2)}%)\n`;
            output += `    - 手动模式: ${legacyManualCount} 次 (${(legacyManualCount / totalLegacyQueries * 100).toFixed(2)}%)\n`;
        }
    }
    output += '\n';


    // === 4. 用户轨迹 (核心修改部分) ===
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
                let modeText = '';
                if (event.queryModule === '定制中转') {
                    const queryData = event.rawPayload.queryData as QueryData;
                    const hasUsedRecommendPath = queryData?.recommendPaths?.some(p => p.used) ?? false;
                    const hasUsedCustomPath = queryData?.customPaths?.some(p => p.used) ?? false;
                    if (hasUsedRecommendPath) modeText = '(自动)';
                    else if (hasUsedCustomPath) modeText = '(手动)';
                } else if (event.queryModule === '快速联程') {
                    modeText = event.isAutoMode !== null ? (event.isAutoMode ? '(自动)' : '(手动)') : '';
                }

                output += `  ${index + 1}. [${date}] ${event.queryModule} ${event.departureStation}→${event.arrivalStation} ${modeText}\n`;

                // [核心修改] 为“定制中转”模块补充带前缀的详细路径
                if (event.queryModule === '定制中转') {
                    const queryData = event.rawPayload.queryData as QueryData;
                    let hasAnyPath = false;

                    // 1. 处理直达路径
                    if (queryData?.directPaths) {
                        queryData.directPaths.forEach(path => {
                            if (path.used) {
                                hasAnyPath = true;
                                const pathString = stationPathPair2StringForShowV2(path.path);
                                output += `    - 直达路径: ${pathString}\n`;
                            }
                        });
                    }

                    // 2. 处理推荐路径
                    if (queryData?.recommendPaths) {
                        queryData.recommendPaths.forEach(path => {
                            if (path.used) {
                                hasAnyPath = true;
                                const pathString = stationPathPair2StringForShowV2(path.path);
                                output += `    - 推荐路径: ${pathString}\n`;
                            }
                        });
                    }

                    // 3. 处理手动路径
                    if (queryData?.customPaths) {
                        queryData.customPaths.forEach(path => {
                            if (path.used) {
                                hasAnyPath = true;
                                const pathString = stationPathPair2StringForShowV2(path.path);
                                output += `    - 手动路径: ${pathString}\n`;
                            }
                        });
                    }

                    if (!hasAnyPath) {
                        output += `    - 路径: (无有效路径)\n`;
                    }
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
