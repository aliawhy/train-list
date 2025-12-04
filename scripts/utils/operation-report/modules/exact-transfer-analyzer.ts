import {BaseModuleAnalyzer} from './base-analyzer';
import {AnalyzedQueryData, ExactTransferAnalysis} from '../report-generation-types';

export class ExactTransferAnalyzer extends BaseModuleAnalyzer<ExactTransferAnalysis> {
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
