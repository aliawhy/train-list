import {simpleGit, SimpleGit} from 'simple-git';
import {decompress as zstdDecompress} from '@mongodb-js/zstd';
import {decode as msgpackDecoder} from 'msgpack-lite';
import path from "path";
import fs from "fs";
import {logTime} from "../log/LogUtils";
import {TrainDetailMap} from "../../processGDCJ";
import {TrainDetail} from "../fetch/TrainDetailUtils";
import {BaseVersionFile} from "../file/FileUtils";

// =================================================================
// 2. 历史数据工具类 (全局静态)
// =================================================================

/**
 * 历史列车数据工具类 (全局静态)
 * 负责从远程仓库加载、解析并提供历史列车数据的查询功能。
 * 该类为静态类，数据在首次调用时加载一次，全局共享。
 */
export class HistoryResultUtil {

    /**
     * 从历史版本文件中直接取用的日期
     * 紧急刷新 但不想更新、丢失某日期时，在这里填写保护日期
     */
    public static readonly PROTECTED_HISTORY_DATES: string[] = [
        // '2025-10-24'
    ];

    /**
     * 初始化状态标志
     */
    private static isInitialized: boolean = false;

    /**
     * 解析后的历史数据，以日期为键
     */
    private static oldResult: TrainDetailMap = {};

    /**
     * 车次号到列车详情的映射，方便快速查询
     * 格式: Map<日期, Map<车次号, TrainDetail>>
     */
    private static trainDetailMapByDateAndCode: Map<string, Map<string, TrainDetail>> = new Map();

    /**
     * 私有构造函数，防止外部实例化
     */
    private constructor() {
    }

    /**
     * 初始化工具类，从 Gitee 仓库加载并解析历史数据。
     * 此方法是幂等的，多次调用也只会在第一次执行加载逻辑。
     * @param __dirname 当前脚本目录，用于定位临时文件路径
     */
    public static async initialize(__dirname: string): Promise<void> {
        if (this.isInitialized) {
            console.debug(`${logTime()} [HistoryResultUtil] 已经初始化，跳过重复加载。`);
            return;
        }

        console.log(`${logTime()} [HistoryResultUtil] 开始初始化，准备加载历史数据...`);
        const fileDir = path.join(__dirname, '..', 'data', 'gdcj-train-detail');
        const tempRepoDir = path.join(fileDir, 'temp-repo-for-history-util');
        const versionFileName = `gdcj.version.json`;

        try {
            const giteeUrl = process.env.GITEE_URL;
            if (!giteeUrl) {
                throw new Error("GITEE_URL 环境变量未设置");
            }

            // 1. 克隆仓库
            const git: SimpleGit = simpleGit();
            if (fs.existsSync(tempRepoDir)) {
                fs.rmSync(tempRepoDir, {recursive: true, force: true});
            }
            await git.clone(giteeUrl, tempRepoDir);
            console.debug(`${logTime()} [HistoryResultUtil] 历史仓库克隆完成。`);

            // 2. 读取版本文件，找到数据文件名
            const versionFilePath = path.join(tempRepoDir, 'data', 'gdcj', versionFileName);
            if (!fs.existsSync(versionFilePath)) {
                console.warn(`${logTime()} [HistoryResultUtil] 历史版本文件不存在: ${versionFilePath}。初始化失败。`);
                return;
            }
            const versionData: BaseVersionFile = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
            const historyFileName = versionData._fileName;
            console.debug(`${logTime()} [HistoryResultUtil] 找到历史版本文件: ${historyFileName}`);

            // 3. 读取、解压、解码数据文件
            const historyFilePath = path.join(tempRepoDir, 'data', 'gdcj', historyFileName);
            if (!fs.existsSync(historyFilePath)) {
                console.warn(`${logTime()} [HistoryResultUtil] 历史数据文件不存在: ${historyFilePath}。初始化失败。`);
                return;
            }
            const compressedHistoryData = fs.readFileSync(historyFilePath);
            const msgpackBuffer = await zstdDecompress(compressedHistoryData);
            this.oldResult = msgpackDecoder(msgpackBuffer) as TrainDetailMap;
            console.debug(`${logTime()} [HistoryResultUtil] 历史数据解压和解码完毕。`);

            // 4. 构建内部查询索引
            this.buildInternalIndex();
            console.log(`${logTime()} [HistoryResultUtil] 初始化完成，共加载 ${Object.keys(this.oldResult).length} 天的数据。`);
            this.isInitialized = true;

        } catch (error) {
            console.error(`${logTime()} [HistoryResultUtil] 初始化时发生错误，历史数据将不可用。错误详情:`, error);
            this.oldResult = {}; // 确保失败时数据为空对象
            this.isInitialized = true; // 标记为已尝试初始化，避免重复失败
        } finally {
            // 5. 清理临时目录
            if (fs.existsSync(tempRepoDir)) {
                fs.rmSync(tempRepoDir, {recursive: true, force: true});
                console.debug(`${logTime()} [HistoryResultUtil] 临时仓库已清理。`);
            }
        }
    }

    /**
     * 确保工具类已初始化。
     * 如果未初始化，则抛出错误，提示应先调用 initialize 方法。
     * @private
     */
    private static ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('HistoryResultUtil 尚未初始化。请先调用 HistoryResultUtil.initialize(__dirname) 方法。');
        }
    }

    /**
     * 根据 oldResult 构建一个便于快速查询的内部索引
     * 将数据结构从 Record<date, TrainDetail[]> 转换为 Map<date, Map<code, TrainDetail>>
     * @private
     */
    private static buildInternalIndex(): void {
        for (const dateKey in this.oldResult) {
            const trainMapForDate = new Map<string, TrainDetail>();
            for (const trainDetail of this.oldResult[dateKey]) {
                // 遍历一趟列车的所有停靠站，收集所有出现过的车次号
                const uniqueTrainCodes = new Set(trainDetail.stopTime.map(st => st.stationTrainCode));
                uniqueTrainCodes.forEach(code => {
                    trainMapForDate.set(code, trainDetail);
                });
            }
            this.trainDetailMapByDateAndCode.set(dateKey, trainMapForDate);
        }
    }

    /**
     * 将日期字符串标准化为 'YYYY-MM-DD' 格式。
     * 支持 'YYYY-MM-DD' 和 'YYYYMMDD' 两种输入格式。
     * @private
     * @param dateStr 输入的日期字符串
     * @returns 标准化后的 'YYYY-MM-DD' 格式字符串，如果格式无效则返回原字符串
     */
    private static normalizeDateFormat(dateStr: string): string {
        // 如果已经包含 '-'，说明格式正确，直接返回
        if (dateStr.includes('-')) {
            return dateStr;
        }

        // 如果是8位纯数字，则按 'YYYYMMDD' 格式处理
        if (/^\d{8}$/.test(dateStr)) {
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            return `${year}-${month}-${day}`;
        }

        // 如果格式不符合预期，记录警告并返回原字符串，让后续逻辑处理
        console.warn(`${logTime()} [HistoryResultUtil] 日期格式${dateStr} 无法识别，请使用 'YYYY-MM-DD' 或 'YYYYMMDD' 格式。`);
        return dateStr;
    }

    /**
     * 根据日期获取当天的所有唯一车次号列表
     * @param date 日期字符串，支持 'YYYY-MM-DD' 或 'YYYYMMDD' 格式
     * @returns 车次号字符串数组，如果日期不存在则返回空数组
     */
    public static getTrainListByDate(date: string): string[] {
        // 1. 在函数入口处，首先对日期格式进行标准化处理
        const normalizedDate = this.normalizeDateFormat(date);

        this.ensureInitialized();
        // 2. 使用标准化后的日期进行查询
        const trainMap = this.trainDetailMapByDateAndCode.get(normalizedDate);
        if (!trainMap) {
            // 日志中也使用标准化后的日期，以保持一致性
            console.warn(`${logTime()} [HistoryResultUtil] 未找到日期${normalizedDate} 的数据。`);
            return [];
        }
        return Array.from(trainMap.keys());
    }

    /**
     * 根据日期和车次号获取列车详情
     * @param date 日期字符串，支持 'YYYY-MM-DD' 或 'YYYYMMDD' 格式
     * @param trainCode 车次号，例如 'G1'
     * @returns TrainDetail 对象，如果未找到则返回 undefined
     */
    public static getTrainDetail(date: string, trainCode: string): TrainDetail | undefined {
        // 1. 在函数入口处，首先对日期格式进行标准化处理
        const normalizedDate = this.normalizeDateFormat(date);

        this.ensureInitialized();
        // 2. 使用标准化后的日期进行查询
        const trainMap = this.trainDetailMapByDateAndCode.get(normalizedDate);
        if (!trainMap) {
            // 日志中也使用标准化后的日期，以保持一致性
            console.warn(`${logTime()} [HistoryResultUtil] 未找到日期${normalizedDate} 的数据。`);
            return undefined;
        }
        const detail = trainMap.get(trainCode);
        if (!detail) {
            console.debug(`${logTime()} [HistoryResultUtil] 在日期${normalizedDate} 的数据中未找到车次 ${trainCode}。`);
        }
        return detail;
    }

    public static isProtectedDateFromHistory(date: string): boolean {
        return this.PROTECTED_HISTORY_DATES.includes(date);
    }
}
