import { AnalyzedQueryData, ModuleAnalysisResult } from '../../types/report-generation-types';

/**
 * 模块分析器的抽象基类
 * 每个业务模块（如广东城际、定制中转）都应实现此接口
 */
export abstract class BaseModuleAnalyzer<T extends ModuleAnalysisResult = ModuleAnalysisResult> {
    /**
     * 获取该分析器对应的模块名称
     */
    abstract getModuleName(): string;

    /**
     * 分析属于该模块的数据
     * @param moduleData 属于该模块的所有查询数据
     */
    abstract analyze(moduleData: AnalyzedQueryData[]): T;

    /**
     * 将分析结果渲染成报告文本片段
     * @param analysisResult 分析结果
     */
    abstract render(analysisResult: T): string;
}
