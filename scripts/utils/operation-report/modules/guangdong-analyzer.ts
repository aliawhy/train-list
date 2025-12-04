import {BaseModuleAnalyzer} from './base-analyzer';
import {AnalyzedQueryData, GuangdongAnalysis} from '../report-generation-types';

export class GuangdongAnalyzer extends BaseModuleAnalyzer<GuangdongAnalysis> {
    getModuleName(): string {
        return '广东城际';
    }

    analyze(moduleData: AnalyzedQueryData[]): GuangdongAnalysis {
        const analysis: GuangdongAnalysis = {
            summary: '', // 将在 render 中生成
            familiarModeCount: 0,
            basicModeCount: 0,
            simpleTransferTimeCounts: {},
            complexTransferTimeCounts: {},
        };

        moduleData.forEach(item => {
            if (item.isGDCJFamiliarMode) {
                analysis.familiarModeCount++;
                if (item.simpleStationMinTransferTimeForGDCJ !== null) {
                    analysis.simpleTransferTimeCounts[item.simpleStationMinTransferTimeForGDCJ] =
                        (analysis.simpleTransferTimeCounts[item.simpleStationMinTransferTimeForGDCJ] || 0) + 1;
                }
                if (item.complexStationMinTransferTimeForGDC !== null) {
                    analysis.complexTransferTimeCounts[item.complexStationMinTransferTimeForGDC] =
                        (analysis.complexTransferTimeCounts[item.complexStationMinTransferTimeForGDC] || 0) + 1;
                }
            } else {
                analysis.basicModeCount++;
            }
        });

        return analysis;
    }

    render(analysis: GuangdongAnalysis): string {
        let output = '';
        output += `--- 2.5 广东城际熟路模式分析 ---\n`;
        output += `熟路模式查询: ${analysis.familiarModeCount} 次\n`;
        output += `基础模式查询: ${analysis.basicModeCount} 次\n\n`;

        if (analysis.familiarModeCount > 0) {
            output += `--- 2.5.1 熟路模式 - 简单换乘耗时配置 Top 10 ---\n`;
            // 注意：这里需要引入一个通用的格式化函数，我们稍后在 report-builder 中定义它
            output += this.formatTopList(analysis.simpleTransferTimeCounts, '次', 10, true);
            output += '\n';

            output += `--- 2.5.2 熟路模式 - 复杂换乘耗时配置 Top 10 ---\n`;
            output += this.formatTopList(analysis.complexTransferTimeCounts, '次', 10, true);
            output += '\n';
        }
        return output;
    }

    // 临时辅助函数，后续会移到 report-builder 或 utils 中
    private formatTopList(counts: { [key: string]: number }, unit: string, limit: number = 10, isKeyNumeric: boolean = false): string {
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
        sortedList.forEach(([name, count], index) => { result += `${index + 1}. ${name}: ${count} ${unit}\n`; });
        return result;
    }
}
