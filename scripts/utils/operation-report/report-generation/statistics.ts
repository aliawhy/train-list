// 通用统计生成器

import {AnalyzedQueryData, DetailedStats} from '../report-generation-types';

export function getDetailedStats(data: AnalyzedQueryData[]): Record<string, DetailedStats> {
    const stats: Record<string, DetailedStats> = {
        all: createEmptyDetailedStats(),
        '广东城际': createEmptyDetailedStats(),
        '定制中转': createEmptyDetailedStats(),
        '拼接中转': createEmptyDetailedStats(),
    };

    data.forEach(item => {
        const {queryModule, departureStation, arrivalStation} = item;
        const route = `${departureStation}→${arrivalStation}`;

        updateStatsForModule(stats.all, departureStation, arrivalStation, route);
        if (stats[queryModule]) {
            updateStatsForModule(stats[queryModule], departureStation, arrivalStation, route);
        }
    });

    return stats;
}

function createEmptyDetailedStats(): DetailedStats {
    return {
        routeCounts: {},
        totalStationCounts: {},
        departureStationCounts: {},
        arrivalStationCounts: {},
    };
}

function updateStatsForModule(moduleStats: DetailedStats, departure: string, arrival: string, route: string): void {
    moduleStats.routeCounts[route] = (moduleStats.routeCounts[route] || 0) + 1;
    moduleStats.totalStationCounts[departure] = (moduleStats.totalStationCounts[departure] || 0) + 1;
    moduleStats.totalStationCounts[arrival] = (moduleStats.totalStationCounts[arrival] || 0) + 1;
    moduleStats.departureStationCounts[departure] = (moduleStats.departureStationCounts[departure] || 0) + 1;
    moduleStats.arrivalStationCounts[arrival] = (moduleStats.arrivalStationCounts[arrival] || 0) + 1;
}
