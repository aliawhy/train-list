import {BaseModuleAnalyzer} from './base-analyzer';
import {AnalyzedQueryData, CustomTransferAnalysis} from "../report-generation-types";
import {QueryData} from "../journey-query-filter-types";

export class CustomTransferAnalyzer extends BaseModuleAnalyzer<CustomTransferAnalysis> {
    getModuleName(): string {
        return '定制中转';
    }

    analyze(moduleData: AnalyzedQueryData[]): CustomTransferAnalysis {
        const analysis: CustomTransferAnalysis = {
            summary: '', // 将在 render 中生成
            totalQueries: 0, totalUsedPaths: 0, directPathUsageCount: 0, recommendPathUsageCount: 0,
            customPathUsageCount: 0, totalTransferStops: 0, queriesWithTransfer: 0,
            exploratoryUserQueries: 0, directOnlyQueries: 0, noValidPathQueries: 0
        };

        analysis.totalQueries = moduleData.length;

        moduleData.forEach(event => {
            const queryData = event.rawPayload.queryData as QueryData;
            const usedDirectPaths = queryData?.directPaths?.filter(p => p.used) ?? [];
            const usedRecommendPaths = queryData?.recommendPaths?.filter(p => p.used) ?? [];
            const usedCustomPaths = queryData?.customPaths?.filter(p => p.used) ?? [];

            const totalUsedInThisQuery = usedDirectPaths.length + usedRecommendPaths.length + usedCustomPaths.length;
            analysis.totalUsedPaths += totalUsedInThisQuery;

            analysis.directPathUsageCount += usedDirectPaths.length;
            analysis.recommendPathUsageCount += usedRecommendPaths.length;
            analysis.customPathUsageCount += usedCustomPaths.length;

            const allTransferPaths = [...usedRecommendPaths, ...usedCustomPaths];
            allTransferPaths.forEach(path => {
                analysis.totalTransferStops += (path.path.length - 1);
            });

            if (allTransferPaths.length > 0) {
                analysis.queriesWithTransfer++;
            }

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

    render(analysis: CustomTransferAnalysis): string {
        let output = '';
        if (analysis.totalQueries === 0) {
            output += '定制中转模块无查询数据。\n\n';
            return output;
        }

        output += `--- 3.1 路径使用分析 (基于 ${analysis.totalQueries} 次查询) ---\n`;
        output += `总采纳路径数: ${analysis.totalUsedPaths}\n`;
        output += `  - 直达路径采纳: ${analysis.directPathUsageCount} 次 (${(analysis.directPathUsageCount / analysis.totalUsedPaths * 100).toFixed(2)}%)\n`;
        output += `  - 推荐路径采纳: ${analysis.recommendPathUsageCount} 次 (${(analysis.recommendPathUsageCount / analysis.totalUsedPaths * 100).toFixed(2)}%)\n`;
        output += `  - 自定义路径采纳: ${analysis.customPathUsageCount} 次 (${(analysis.customPathUsageCount / analysis.totalUsedPaths * 100).toFixed(2)}%)\n\n`;

        output += `--- 3.2 中转偏好分析 ---\n`;
        const avgTransfers = analysis.queriesWithTransfer > 0 ? (analysis.totalTransferStops / analysis.queriesWithTransfer).toFixed(2) : '0';
        output += `平均中转次数 (仅限有中转的查询): ${avgTransfers} 次\n`;
        output += `涉及中转的查询数: ${analysis.queriesWithTransfer} 次 (${(analysis.queriesWithTransfer / analysis.totalQueries * 100).toFixed(2)}%)\n\n`;

        output += `--- 3.3 用户行为洞察 ---\n`;
        output += `“探索型”用户查询 (同时使用推荐和自定义): ${analysis.exploratoryUserQueries} 次 (${(analysis.exploratoryUserQueries / analysis.totalQueries * 100).toFixed(2)}%)\n`;
        output += `“纯直达”用户查询 (仅使用直达路径): ${analysis.directOnlyQueries} 次 (${(analysis.directOnlyQueries / analysis.totalQueries * 100).toFixed(2)}%)\n`;
        output += `无有效路径的查询: ${analysis.noValidPathQueries} 次 (${(analysis.noValidPathQueries / analysis.totalQueries * 100).toFixed(2)}%)\n\n`;

        return output;
    }
}
