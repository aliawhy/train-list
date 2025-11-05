import {simpleGit, SimpleGit} from 'simple-git';
import {decompress as zstdDecompress} from '@mongodb-js/zstd';
import {decode as msgpackDecoder} from 'msgpack-lite';
import path from "path";
import fs from "fs";
import {logTime} from "../log/LogUtils";
import {TrainDetailMap} from "../../processGDCJ";
import {TrainDetail} from "../fetch/TrainDetailUtils";
import {BaseVersionFile} from "../file/FileUtils";
import {APP_NAME} from "../app-env/app-env-url";

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
     * 检查远程仓库中是否存在指定的分支。
     * @param gitRepoUrl Git 仓库 URL
     * @param branchName 要检查的分支名
     * @returns 如果分支存在则返回 true，否则返回 false
     * @private
     */
    // --- 修改点 1: 新增私有方法用于检查远程分支是否存在 ---
    private static async checkBranchExists(gitRepoUrl: string, branchName: string): Promise<boolean> {
        try {
            // 使用 ls-remote 查询远程仓库的引用，并过滤出我们想要的分支
            // `refs/heads/${branchName}` 是分支在远程仓库中的完整路径
            const remoteRefs = await simpleGit().listRemote(['--refs', gitRepoUrl, `refs/heads/${branchName}`]);
            // 如果返回结果不为空，说明分支存在
            return remoteRefs.trim().length > 0;
        } catch (error) {
            console.error(`${logTime()} [HistoryResultUtil] 检查分支 ${branchName} 时发生错误:`, error);
            return false;
        }
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

        const versionBranchName = `version_${APP_NAME}-gdcj-train-detail`;
        const dataBranchName = `data_${APP_NAME}-gdcj-train-detail`;
        const versionFileName = `${APP_NAME}-gdcj-train-detail.version.json`;

        const baseTempDir = path.join(__dirname, '..', 'temp-for-history-util');
        const tempVersionRepoDir = path.join(baseTempDir, 'version-repo');
        const tempDataRepoDir = path.join(baseTempDir, 'data-repo');

        if (!fs.existsSync(baseTempDir)) {
            fs.mkdirSync(baseTempDir, {recursive: true});
        }

        try {
            const gitRepoUrl = process.env.MY_GITHUB_MINI_DATA_DOWNLOADER_URL;
            if (!gitRepoUrl) {
                throw new Error("MY_GITHUB_MINI_DATA_DOWNLOADER_URL 环境变量未设置");
            }

            // --- 修改点 2: 在克隆 version 分支前，先检查其是否存在 ---
            console.debug(`${logTime()} [HistoryResultUtil] 正在检查远程分支 ${versionBranchName} 是否存在...`);
            const versionBranchExists = await this.checkBranchExists(gitRepoUrl, versionBranchName);
            if (!versionBranchExists) {
                console.warn(`${logTime()} [HistoryResultUtil] 远程分支 ${versionBranchName} 不存在。无法加载历史数据。`);
                this.isInitialized = true; // 标记为已尝试，避免重复失败
                return;
            }
            console.debug(`${logTime()} [HistoryResultUtil] 远程分支 ${versionBranchName} 存在。`);

            // 1. 克隆 version 分支并读取版本文件
            console.debug(`${logTime()} [HistoryResultUtil] 正在克隆 ${versionBranchName} 分支以获取版本信息...`);
            const git: SimpleGit = simpleGit();
            if (fs.existsSync(tempVersionRepoDir)) {
                fs.rmSync(tempVersionRepoDir, {recursive: true, force: true});
            }
            await git.clone(gitRepoUrl, tempVersionRepoDir, ['--branch', versionBranchName, '--single-branch']);
            console.debug(`${logTime()} [HistoryResultUtil] ${versionBranchName} 分支克隆完成。`);

            const versionFilePath = path.join(tempVersionRepoDir, 'version', versionFileName);
            if (!fs.existsSync(versionFilePath)) {
                console.warn(`${logTime()} [HistoryResultUtil] 历史版本文件不存在: ${versionFilePath}。初始化失败。`);
                this.isInitialized = true;
                return;
            }
            const versionData: BaseVersionFile = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
            const historyFileName = versionData._fileName;
            console.debug(`${logTime()} [HistoryResultUtil] 找到历史版本信息，数据文件名为: ${historyFileName}`);

            // --- 修改点 3: 在克隆 data 分支前，先检查其是否存在 ---
            console.debug(`${logTime()} [HistoryResultUtil] 正在检查远程分支 ${dataBranchName} 是否存在...`);
            const dataBranchExists = await this.checkBranchExists(gitRepoUrl, dataBranchName);
            if (!dataBranchExists) {
                console.warn(`${logTime()} [HistoryResultUtil] 远程分支 ${dataBranchName} 不存在，但版本文件指向的数据文件为 ${historyFileName}。无法加载数据。`);
                this.isInitialized = true;
                return;
            }
            console.debug(`${logTime()} [HistoryResultUtil] 远程分支 ${dataBranchName} 存在。`);

            // 2. 克隆 data 分支并读取数据文件
            console.debug(`${logTime()} [HistoryResultUtil] 正在克隆 ${dataBranchName} 分支以获取数据文件...`);
            if (fs.existsSync(tempDataRepoDir)) {
                fs.rmSync(tempDataRepoDir, {recursive: true, force: true});
            }
            await git.clone(gitRepoUrl, tempDataRepoDir, ['--branch', dataBranchName, '--single-branch']);
            console.debug(`${logTime()} [HistoryResultUtil] ${dataBranchName} 分支克隆完成。`);

            const historyFilePath = path.join(tempDataRepoDir, 'data', historyFileName);
            if (!fs.existsSync(historyFilePath)) {
                console.warn(`${logTime()} [HistoryResultUtil] 历史数据文件不存在: ${historyFilePath}。初始化失败。`);
                this.isInitialized = true;
                return;
            }

            // 3. 读取、解压、解码数据文件
            console.debug(`${logTime()} [HistoryResultUtil] 正在解压和解码历史数据文件...`);
            const compressedHistoryData = fs.readFileSync(historyFilePath);
            const msgpackBuffer = await zstdDecompress(compressedHistoryData);
            this.oldResult = msgpackDecoder(msgpackBuffer) as TrainDetailMap;
            console.debug(`${logTime()} [HistoryResultUtil] 历史数据解压和解码完毕。`);

            // 4. 构建内部查询索引
            this.buildInternalIndex();
            console.log(`${logTime()} [HistoryResultUtil] 初始化完成，共加载 ${Object.keys(this.oldResult).join(",")} 的数据。`, );
            this.isInitialized = true;

        } catch (error) {
            console.error(`${logTime()} [HistoryResultUtil] 初始化时发生错误，历史数据将不可用。错误详情:`, error);
            this.oldResult = {};
            this.isInitialized = true;
        } finally {
            // 5. 清理所有临时目录
            if (fs.existsSync(baseTempDir)) {
                fs.rmSync(baseTempDir, {recursive: true, force: true});
                console.debug(`${logTime()} [HistoryResultUtil] 所有临时仓库已清理。`);
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
        if (dateStr.includes('-')) {
            return dateStr;
        }
        if (/^\d{8}$/.test(dateStr)) {
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            return `${year}-${month}-${day}`;
        }
        console.warn(`${logTime()} [HistoryResultUtil] 日期格式${dateStr} 无法识别，请使用 'YYYY-MM-DD' 或 'YYYYMMDD' 格式。`);
        return dateStr;
    }

    /**
     * 根据日期获取当天的所有唯一车次号列表
     * @param date 日期字符串，支持 'YYYY-MM-DD' 或 'YYYYMMDD' 格式
     * @returns 车次号字符串数组，如果日期不存在则返回空数组
     */
    public static getTrainListByDate(date: string): string[] {
        const normalizedDate = this.normalizeDateFormat(date);
        this.ensureInitialized();
        const trainMap = this.trainDetailMapByDateAndCode.get(normalizedDate);
        if (!trainMap) {
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
        const normalizedDate = this.normalizeDateFormat(date);
        this.ensureInitialized();
        const trainMap = this.trainDetailMapByDateAndCode.get(normalizedDate);
        if (!trainMap) {
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
