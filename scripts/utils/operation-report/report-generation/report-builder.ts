// 报告构建器 负责将所有数据和模块分析结果组合成最终的文本报告

import {DetailedStats, ReportBuildParams, TopListOptions} from '../report-generation-types';
import {QueryData, StationPathPair} from '../journey-query-filter-types';
import {getBeijingTimeString} from "../../date/DateUtil";
//
// export function buildReportContent(params: ReportBuildParams): string {
//     let output = '';
//     output += buildHeader();
//     output += buildOverview(params);
//     output += buildTopLists(params.detailedStats);
//     output += buildModuleAnalyses(params.moduleAnalyses);
//     output += buildUserTrajectories(params.userTrajectories);
//     return output;
// }
//
// function buildHeader(): string {
//     let output = '';
//     output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
//     output += '║                                    运营数据报告                                      ║\n';
//     output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n\n';
//     return output;
// }
//
// function buildOverview(params: ReportBuildParams): string {
//     let output = '';
//     output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
//     output += '║                                          1. 总体概览                                               ║\n';
//     output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
//     output += `总查询量: ${params.totalQueries}\n`;
//     output += `独立用户数 (UV): ${params.uniqueUsers}\n`;
//     output += `人均查询次数: ${params.avgQueriesPerUser}\n\n`;
//     output += `--- 按模块分布 ---\n`;
//     output += `广东城际板块查询量: ${params.guangdongCount}\n`;
//     output += `定制中转板块查询量: ${params.rapidCount}\n`;
//     output += `拼接中转板块查询量: ${params.exactCount}\n\n`;
//     return output;
// }
//
// function buildTopLists(detailedStats: Record<string, DetailedStats>): string {
//     let output = '';
//     const modules = [
//         {key: 'all', name: '全模块'}, {key: '广东城际', name: '广东城际'},
//         {key: '定制中转', name: '定制中转'}, {key: '拼接中转', name: '拼接中转'},
//     ];
//
//     modules.forEach(module => {
//         const moduleStats = detailedStats[module.key];
//         if (!moduleStats) return;
//
//         output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
//         output += `║                                   2. ${module.name} Top 10 数据详情                                    ║\n`;
//         output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
//         output += `--- 2.1 查询线路 Top 10 ---\n`;
//         output += appendTopList(moduleStats.routeCounts, {unit: '次'});
//         output += '\n';
//         output += `--- 2.2 查询车站 Top 10 (出发或到达) ---\n`;
//         output += appendTopList(moduleStats.totalStationCounts, {unit: '次'});
//         output += '\n';
//         output += `--- 2.3 出发车站 Top 10 ---\n`;
//         output += appendTopList(moduleStats.departureStationCounts, {unit: '次'});
//         output += '\n';
//         output += `--- 2.4 到达车站 Top 10 ---\n`;
//         output += appendTopList(moduleStats.arrivalStationCounts, {unit: '次'});
//         output += '\n\n';
//     });
//     return output;
// }
//
// function buildModuleAnalyses(moduleAnalyses: Record<string, any>): string {
//     let output = '';
//     output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
//     output += '║                                   3. 模块深度分析                                          ║\n';
//     output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
//
//     // 按预定义顺序渲染模块分析，保证报告结构稳定
//     const order = ['广东城际', '定制中转', '拼接中转'];
//     order.forEach(moduleName => {
//         if (moduleAnalyses[moduleName]) {
//             output += moduleAnalyses[moduleName];
//         }
//     });
//
//     return output;
// }
//
// function buildUserTrajectories(userTrajectories: Record<string, any>): string {
//     let output = '';
//     output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
//     output += '║                                          4. 用户轨迹                                               ║\n';
//     output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
//     const sortedUserIds = Object.keys(userTrajectories).sort();
//     if (sortedUserIds.length === 0) {
//         output += '暂无用户轨迹数据。\n';
//     } else {
//         sortedUserIds.forEach(userUuid => {
//             output += `--- 用户ID: ${userUuid} ---\n`;
//             const trajectory = userTrajectories[userUuid];
//             trajectory.forEach((event: any, index: number) => {
//                 const date = getBeijingTimeString(event.eventTimestamp, 'datetime');
//                 let logLine = `  ${index + 1}. [${date}] ${event.queryModule} ${event.departureStation}→${event.arrivalStation} (出发日期: ${event.departureDay})`;
//                 output += logLine + '\n';
//
//                 if (event.queryModule === '广东城际') {
//                     const mode = event.isGDCJFamiliarMode ? '熟路模式' : '基础模式';
//                     let timeInfo = '';
//                     if (event.isGDCJFamiliarMode) {
//                         const simpleTime = event.simpleStationMinTransferTimeForGDCJ ?? 'N/A';
//                         const complexTime = event.complexStationMinTransferTimeForGDC ?? 'N/A';
//                         timeInfo = ` 简单换乘值: ${simpleTime} 复杂换乘值:${complexTime}`;
//                     }
//                     logLine += ` (${mode}${timeInfo})`;
//                 }
//
//                 output += logLine + '\n';
//
//                 if (event.queryModule === '定制中转') {
//                     const queryData = event.rawPayload.queryData as QueryData;
//                     let hasAnyPath = false;
//                     const pathTypes = [
//                         {name: '直达路径', paths: queryData?.directPaths},
//                         {name: '推荐路径', paths: queryData?.recommendPaths},
//                         {name: '手动路径', paths: queryData?.customPaths},
//                     ];
//                     pathTypes.forEach(type => {
//                         type.paths?.forEach((path: any) => {
//                             if (path.used) {
//                                 hasAnyPath = true;
//                                 output += `    - ${type.name}: ${stationPathPair2StringForShowV2(path.path)}\n`;
//                             }
//                         });
//                     });
//                     if (!hasAnyPath) {
//                         output += `    - 路径: (无有效路径)\n`;
//                     }
//                 }
//             });
//             output += '\n';
//         });
//     }
//     return output;
// }
//
// // --- 辅助函数 ---
//
// function stationPathPair2StringForShowV2(path: StationPathPair[]): string {
//     return path.map(pair => `${pair.station1}→${pair.station2}`).join(' | ');
// }
//
// export function appendTopList(counts: { [key: string]: number }, options: TopListOptions): string {
//     const {unit, limit = 10, isKeyNumeric = false} = options;
//     let sortedList;
//     if (isKeyNumeric) {
//         sortedList = Object.entries(counts)
//             .sort(([, a], [, b]) => b - a)
//             .sort(([aKey], [bKey]) => Number(aKey) - Number(bKey))
//             .slice(0, limit);
//     } else {
//         sortedList = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, limit);
//     }
//     if (sortedList.length === 0) return '暂无数据。\n';
//     let result = '';
//     sortedList.forEach(([name, count], index) => {
//         result += `${index + 1}. ${name}: ${count} ${unit}\n`;
//     });
//     return result;
// }

export function buildReportContent(params: ReportBuildParams): string {
    let output = '';
    output += buildHeader();
    output += buildOverview(params);
    output += buildTopLists(params.detailedStats);
    output += buildModuleAnalyses(params.moduleAnalyses);
    output += buildUserTrajectories(params.userTrajectories);
    return output;
}

function buildHeader(): string {
    let output = '';
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                    运营数据报告                                      ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n\n';
    return output;
}

function buildOverview(params: ReportBuildParams): string {
    let output = '';
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                          1. 总体概览                                               ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
    output += `总查询量: ${params.totalQueries}\n`;
    output += `独立用户数 (UV): ${params.uniqueUsers}\n`;
    output += `人均查询次数: ${params.avgQueriesPerUser}\n\n`;
    output += `--- 按模块分布 ---\n`;
    output += `广东城际板块查询量: ${params.guangdongCount}\n`;
    output += `定制中转板块查询量: ${params.rapidCount}\n`;
    output += `拼接中转板块查询量: ${params.exactCount}\n\n`;
    return output;
}

function buildTopLists(detailedStats: Record<string, DetailedStats>): string {
    let output = '';
    const modules = [
        { key: 'all', name: '全模块' }, { key: '广东城际', name: '广东城际' },
        { key: '定制中转', name: '定制中转' }, { key: '拼接中转', name: '拼接中转' },
    ];

    modules.forEach(module => {
        const moduleStats = detailedStats[module.key];
        if (!moduleStats) return;

        output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
        output += `║                                   2. ${module.name} Top 10 数据详情                                    ║\n`;
        output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
        output += `--- 2.1 查询线路 Top 10 ---\n`;
        output += appendTopList(moduleStats.routeCounts, { unit: '次' });
        output += '\n';
        output += `--- 2.2 查询车站 Top 10 (出发或到达) ---\n`;
        output += appendTopList(moduleStats.totalStationCounts, { unit: '次' });
        output += '\n';
        output += `--- 2.3 出发车站 Top 10 ---\n`;
        output += appendTopList(moduleStats.departureStationCounts, { unit: '次' });
        output += '\n';
        output += `--- 2.4 到达车站 Top 10 ---\n`;
        output += appendTopList(moduleStats.arrivalStationCounts, { unit: '次' });
        output += '\n\n';
    });
    return output;
}

function buildModuleAnalyses(moduleAnalyses: Record<string, any>): string {
    let output = '';
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                   3. 模块深度分析                                          ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';

    const order = ['广东城际', '定制中转', '拼接中转'];
    order.forEach(moduleName => {
        if (moduleAnalyses[moduleName]) {
            output += moduleAnalyses[moduleName];
        }
    });

    return output;
}

function buildUserTrajectories(userTrajectories: Record<string, any>): string {
    let output = '';
    output += '╔══════════════════════════════════════════════════════════════════════════════════════════════════╗\n';
    output += '║                                          4. 用户轨迹                                               ║\n';
    output += '╚══════════════════════════════════════════════════════════════════════════════════════════════════╝\n';
    const sortedUserIds = Object.keys(userTrajectories).sort();
    if (sortedUserIds.length === 0) {
        output += '暂无用户轨迹数据。\n';
    } else {
        sortedUserIds.forEach(userUuid => {
            output += `--- 用户ID: ${userUuid} ---\n`;
            const trajectory = userTrajectories[userUuid];
            trajectory.forEach((event: any, index: number) => {
                const date = getBeijingTimeString(event.eventTimestamp, 'datetime');
                let logLine = `  ${index + 1}. [${date}] ${event.queryModule}：${event.departureStation}→${event.arrivalStation} (出发日期:${event.departureDay})`;

                // [修复] 为广东城际查询增加模式和换乘时间信息
                if (event.queryModule === '广东城际') {
                    const mode = event.isGDCJFamiliarMode ? '熟路模式' : '基础模式';
                    let timeInfo = '';
                    if (event.isGDCJFamiliarMode) {
                        const simpleTime = event.simpleStationMinTransferTimeForGDCJ ?? 'N/A';
                        const complexTime = event.complexStationMinTransferTimeForGDC ?? 'N/A';
                        timeInfo = ` 简单换乘值: ${simpleTime} 复杂换乘值:${complexTime}`;
                    }
                    logLine += ` (${mode}${timeInfo})`;
                }

                output += logLine + '\n';

                if (event.queryModule === '定制中转') {
                    const queryData = event.rawPayload.queryData as QueryData;
                    let hasAnyPath = false;
                    const pathTypes = [
                        { name: '直达路径', paths: queryData?.directPaths },
                        { name: '推荐路径', paths: queryData?.recommendPaths },
                        { name: '手动路径', paths: queryData?.customPaths },
                    ];
                    pathTypes.forEach(type => {
                        type.paths?.forEach((path: any) => {
                            if (path.used) {
                                hasAnyPath = true;
                                output += `    - ${type.name}:${stationPathPair2StringForShowV2(path.path)}\n`;
                            }
                        });
                    });
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

// --- 辅助函数 ---

function getStationNameFromPair(pair: StationPathPair): { station1: string, station2: string } {
    const station1 = pair.station1 ?? pair.site1 ?? '未知站点';
    const station2 = pair.station2 ?? pair.site2 ?? '未知站点';
    return { station1, station2 };
}

function stationPathPair2StringForShowV2(path: StationPathPair[]): string {
    return path.map(pair => {
        const { station1, station2 } = getStationNameFromPair(pair);
        return `${station1}→${station2}`;
    }).join(' | ');
}
// function stationPathPair2StringForShowV2(path: StationPathPair[]): string {
//     return path.map(pair => `${pair.station1}→${pair.station2}`).join(' | ');
// }

export function appendTopList(counts: { [key: string]: number }, options: TopListOptions): string {
    const { unit, limit = 10, isKeyNumeric = false } = options;
    let sortedList;
    if (isKeyNumeric) {
        sortedList = Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .sort(([aKey], [bKey]) => Number(aKey) - Number(bKey))
            .slice(0, limit);
    } else {
        sortedList = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, limit);
    }
    if (sortedList.length === 0) return '暂无数据。\n';
    let result = '';
    sortedList.forEach(([name, count], index) => { result += `${index + 1}.${name}: ${count}${unit}\n`; });
    return result;
}