import {BaseModuleAnalyzer} from './base-analyzer';
import {AnalyzedQueryData, ExactTransferAnalysis} from '../report-generation-types';

/**
 * 广东铁路模块分析器
 *
 * 注意：此分析器的逻辑与 GuangdongIntercityAnalyzer 完全相同。
 * 为了代码复用和未来扩展，我们通过构造函数来动态设置模块名称。
 * 理想情况下，GuangdongIntercityAnalyzer 和 GuangdongRailwayAnalyzer
 * 可以合并为一个通用的 "GuangdongAnalyzer"，通过传入不同的模块名来实例化。
 * 但为了满足你的要求，这里创建一个独立的文件。
 */
export class GuangdongRailwayAnalyzer extends BaseModuleAnalyzer<ExactTransferAnalysis> {
    getModuleName(): string {
        return '拼接中转';
    }

    analyze(moduleData: AnalyzedQueryData[]): ExactTransferAnalysis {
        // 目前没有特定的深度分析，返回一个空对象即可
        return {
            summary: '', // 将在 render 中生成
        };
    }

    render(analysis: ExactTransferAnalysis): string {
        // 暂时没有特殊内容需要渲染
        return '';
    }
}
