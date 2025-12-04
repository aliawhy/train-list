import { GuangdongAnalyzer } from './guangdong-analyzer';
import { CustomTransferAnalyzer } from './custom-transfer-analyzer';
import { ExactTransferAnalyzer } from './exact-transfer-analyzer';
import { BaseModuleAnalyzer } from './base-analyzer';

// 导出所有分析器实例
export const moduleAnalyzers: BaseModuleAnalyzer[] = [
    new GuangdongAnalyzer(),
    new CustomTransferAnalyzer(),
    new ExactTransferAnalyzer(),
];

// 导出基类，供未来扩展使用
export { BaseModuleAnalyzer };
