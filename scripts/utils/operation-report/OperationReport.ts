import * as fs from 'fs';
import {readAndParseJson, transformData} from './report-generation/data-parser';
import {getDetailedStats} from './report-generation/statistics';
import {buildReportContent} from './report-generation/report-builder';
import {moduleAnalyzers} from './modules';
import {getUserTrajectories} from "./report-generation/user-trajectory";

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

        // 2. 模块深度分析
        const moduleAnalyses: Record<string, string> = {};
        moduleAnalyzers.forEach(analyzer => {
            const moduleName = analyzer.getModuleName();
            const moduleData = analyzedData.filter(d => d.queryModule === moduleName);
            const analysisResult = analyzer.analyze(moduleData);
            moduleAnalyses[moduleName] = analyzer.render(analysisResult);
        });

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
            moduleAnalyses, // 传递所有模块的分析结果
        });

        const reportFilePath = `${filePath}.report.txt`;
        fs.writeFileSync(reportFilePath, reportContent, 'utf-8');
        console.log(`运营报告已成功生成: ${reportFilePath}`);

    } catch (error) {
        console.error(`处理文件时发生错误: ${error instanceof Error ? error.message : error}`);
    }
}

// --- 本地侧式执行函数 ---
const jsonFilePath = 'D:\\工作区\\软件项目\\gitee\\mini-service-database\\track-query\\track-query_2025-12-04.json';
generateOperationTrackEventQueryReport(jsonFilePath);
